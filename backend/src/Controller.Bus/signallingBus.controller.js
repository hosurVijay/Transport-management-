// controllers/bus.controller.js
import { BusSignalling } from "../Models/busSignalling.model.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { Bus } from "../Models/bus.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { calculateDistance } from "../utills/calculateDistance.js";

/**
 * Prototype parameters
 */
const BUNCHING_THRESHOLD_M = 1000; // 1 km threshold
const RECHECK_MS = 10_000; // re-check after 10 seconds

/**
 * Helper: determine progress (stopIndex, distanceToNextStop) for a bus given route stops and tracking coords
 */
async function computeProgressForBus(busId, route) {
  const track = await TrackingBus.findOne({ busID: busId });
  if (!track) return null;

  const stops = route.stops || [];
  if (!stops.length) return null;

  let closestIndex = -1;
  let closestDist = Infinity;

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const d = calculateDistance(
      track.latitude,
      track.longitude,
      s.latitude,
      s.longitude
    );
    if (d < closestDist) {
      closestDist = d;
      closestIndex = i;
    }
  }

  const nextIndex = Math.min(closestIndex + 1, stops.length - 1);
  const nextStop = stops[nextIndex];
  const distToNextStop = nextStop
    ? Math.round(
        calculateDistance(
          track.latitude,
          track.longitude,
          nextStop.latitude,
          nextStop.longitude
        )
      )
    : 0;

  return {
    busId,
    tracking: track,
    stopIndex: closestIndex,
    distToNextStop,
    rawClosestDist: Math.round(closestDist),
    lat: track.latitude,
    lng: track.longitude,
  };
}

/**
 * Helper: decide leader between two progress objects
 * Primary: higher stopIndex (larger = further along route)
 * Tie-breaker: smaller distToNextStop (closer to next stop => further along)
 */
function chooseLeader(p1, p2) {
  if (p1.stopIndex > p2.stopIndex) return { leader: p1, follower: p2 };
  if (p2.stopIndex > p1.stopIndex) return { leader: p2, follower: p1 };

  // same stop index -> one with smaller distance to next stop is more ahead
  if (p1.distToNextStop < p2.distToNextStop)
    return { leader: p1, follower: p2 };
  return { leader: p2, follower: p1 };
}

/**
 * Helper: update BusSignalling for a bus and notify clients
 */
async function updateSignalForBus(
  busObjId,
  newStatus,
  reason = null,
  conflictWith = null,
  distanceFromConflict = null,
  io = null,
  esp32Clients = null
) {
  const signalling = await BusSignalling.findOne({ busId: busObjId });
  if (!signalling) return null;

  signalling.currentStatus = newStatus;
  signalling.reasonForRedSignal = reason || null;

  signalling.conflictingBusId = conflictWith ? conflictWith : null;
  signalling.distanceFromConflictBus = distanceFromConflict ?? null;
  signalling.lastSignalChangeTime = new Date();

  await signalling.save();

  // Notify Socket.IO room (use bus id string)
  try {
    if (io) {
      io.to(busObjId.toString()).emit("busSignalChange", {
        busId: busObjId.toString(),
        currentStatus: newStatus,
        reason: reason,
        conflictingBusId: conflictWith ? conflictWith.toString() : null,
        distanceFromConflictBus: distanceFromConflict ?? null,
        lastSignalChangeTime: signalling.lastSignalChangeTime,
      });
    }
  } catch (e) {
    console.error("Socket.IO emit error:", e);
  }

  // Notify ESP32 if connected
  try {
    if (esp32Clients && esp32Clients.has(busObjId.toString())) {
      const client = esp32Clients.get(busObjId.toString());
      if (client.readyState === 1) {
        client.send(
          JSON.stringify({
            busId: busObjId.toString(),
            currentStatus: newStatus,
            reason,
          })
        );
      }
    }
  } catch (e) {
    console.error("ESP32 notify error:", e);
  }

  return signalling;
}

/**
 * Core: check pair-bunching for a route.
 * For prototype: find all buses on the route, compute pairwise distances,
 * pick pairs where distance <= threshold and both buses are not part of a larger cluster.
 * For any such pair, determine leader (by progress) and set leader green, follower red.
 */
async function evaluatePairsOnRoute(routeId, io, esp32Clients) {
  // load buses on route
  const buses = await Bus.find({ busRouteId: routeId }).lean();
  if (!buses || buses.length < 2) return;

  // map bus _id to index
  const busIds = buses.map((b) => b._id.toString());

  // get tracking for all buses on route
  const trackings = await TrackingBus.find({ busID: { $in: busIds } });
  // map by busId string
  const trackMap = new Map();
  trackings.forEach((t) => trackMap.set(t.busID.toString(), t));

  // compute progress for all buses (only for those with tracking)
  const route = await BusRoute.findById(routeId);
  if (!route) return;

  const progresses = [];
  for (const b of buses) {
    const p = await computeProgressForBus(b._id, route);
    if (p) progresses.push(p);
  }

  if (progresses.length < 2) return;

  // compute pairwise distances and candidate pairs (within threshold)
  const pairs = [];
  for (let i = 0; i < progresses.length; i++) {
    for (let j = i + 1; j < progresses.length; j++) {
      const a = progresses[i];
      const b = progresses[j];
      const d = calculateDistance(a.lat, a.lng, b.lat, b.lng);
      if (d <= BUNCHING_THRESHOLD_M) {
        pairs.push({ a, b, distance: Math.round(d) });
      }
    }
  }

  if (!pairs.length) return;

  // Filter out pairs that form clusters > 2: ensure each bus appears in at most one pair and pairs are disjoint
  // Build frequency map of bus occurrences in pairs
  const freq = new Map();
  pairs.forEach((p) => {
    const idA = p.a.busId.toString();
    const idB = p.b.busId.toString();
    freq.set(idA, (freq.get(idA) || 0) + 1);
    freq.set(idB, (freq.get(idB) || 0) + 1);
  });

  // Only keep pairs where both buses appear exactly once across all pairs (i.e., disjoint pairs)
  const disjointPairs = pairs.filter((p) => {
    const idA = p.a.busId.toString();
    const idB = p.b.busId.toString();
    return freq.get(idA) === 1 && freq.get(idB) === 1;
  });

  // For prototype: if a bus is part of multiple close relations (cluster >2), we ignore those
  if (!disjointPairs.length) return;

  // Process each disjoint pair independently
  for (const pair of disjointPairs) {
    // choose leader by route progress
    const { leader, follower } = chooseLeader(pair.a, pair.b);

    // Update signalling: leader -> green, follower -> red with reason "busBunching"
    await updateSignalForBus(
      leader.busId,
      "green",
      null,
      follower.busId,
      pair.distance,
      io,
      esp32Clients
    );

    await updateSignalForBus(
      follower.busId,
      "red",
      "busBunching",
      leader.busId,
      pair.distance,
      io,
      esp32Clients
    );
  }
}

/**
 * Main controller: handles terminate, readyToMove, GPS update, stop detection, auto-green,
 * AND runs pair-bunching evaluation and schedules re-check after 10s.
 */
const busController = asyncHandler(async (req, res) => {
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");

  const { busId } = req.params;
  const { latitude, longitude, readyToMove, terminated } = req.query;

  if (!busId) throw new ApiError(400, "busId is required");

  // find bus signalling record by busId field (busId is a stringified ObjectId)
  const busSignal = await BusSignalling.findOne({ busId });
  if (!busSignal) throw new ApiError(400, "No bus signalling record found");

  // Ensure we can find the bus doc
  const busDoc = await Bus.findById(busId);
  if (!busDoc) throw new ApiError(400, "No bus found for the provided busId");

  // ============================================================
  // TERMINATE (stop button)
  // ============================================================
  if (terminated === "true") {
    console.log(`🔴 Bus ${busId} manually terminated`);

    busSignal.currentStatus = "red";
    busSignal.controlRoomOverride = "stop";
    busSignal.reasonForRedSignal = "manualOverride";
    busSignal.readyToMovePressed = false;
    busSignal.readyToMovePressedTime = null;
    await busSignal.save();

    // Notify frontend (room: busId) and broadcast summary
    if (io) {
      io.to(busId.toString()).emit("busSignalChange", {
        busId,
        currentStatus: "red",
        reason: "terminated",
      });
      io.emit("busSignalChange", {
        busId,
        currentStatus: "red",
        reason: "terminated",
      });
    }

    // Notify ESP32
    if (esp32Clients?.has(busId.toString())) {
      const client = esp32Clients.get(busId.toString());
      if (client.readyState === 1) {
        client.send(
          JSON.stringify({ busId, currentStatus: "red", reason: "terminated" })
        );
      }
    }
  }

  // ============================================================
  // READY-TO-MOVE (driver pressed)
  // ============================================================
  if (readyToMove === "true") {
    console.log(`🟡 Ready-to-Move pressed by bus ${busId}`);

    if (busSignal.currentStatus === "red") {
      busSignal.currentStatus = "waiting";
      busSignal.readyToMovePressed = true;
      busSignal.readyToMovePressedTime = new Date();
      busSignal.controlRoomOverride = "wait";
      busSignal.reasonForRedSignal = null;
      await busSignal.save();

      if (io) {
        io.to(busId.toString()).emit("busSignalChange", {
          busId,
          currentStatus: "waiting",
          reason: "driverReadyToMove",
        });
      }

      if (esp32Clients?.has(busId.toString())) {
        const client = esp32Clients.get(busId.toString());
        if (client.readyState === 1) {
          client.send(
            JSON.stringify({
              busId,
              currentStatus: "waiting",
              reason: "driverReadyToMove",
            })
          );
        }
      }
      console.log(`➡ Bus ${busId} switched RED → WAITING`);
    }
  }

  // ============================================================
  // GPS update
  // ============================================================
  if (latitude && longitude) {
    await TrackingBus.findOneAndUpdate(
      { busID: busId },
      { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
      { new: true, upsert: true }
    );

    if (io) {
      io.to(busId.toString()).emit("busLocationUpdated", {
        busId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      });
    }

    // broadcast summary location as well
    if (io) {
      io.emit("busLocationUpdated", {
        busId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      });
    }
  }

  // ============================================================
  // DETERMINE CURRENT & NEXT STOP (as before)
  // ============================================================
  let stopInfo = {
    currStop: "Unknown",
    nextStop: "Unknown",
    distanceToNextStop: 0,
  };

  try {
    const tracking = await TrackingBus.findOne({ busID: busId });
    if (tracking) {
      const busRouteDoc = await Bus.findById(busId);
      if (busRouteDoc?.busRouteId) {
        const route = await BusRoute.findById(busRouteDoc.busRouteId);
        if (route?.stops?.length > 0) {
          let closestStop = null;
          let closestDist = Infinity;
          route.stops.forEach((stop, index) => {
            const dist = calculateDistance(
              tracking.latitude,
              tracking.longitude,
              stop.latitude,
              stop.longitude
            );
            if (dist < closestDist) {
              closestDist = dist;
              closestStop = { ...stop, index };
            }
          });

          if (closestStop) {
            stopInfo.currStop = closestStop.name;
            stopInfo.nextStop =
              route.stops[closestStop.index + 1]?.name || "Final Stop";

            const nextStopObj = route.stops[closestStop.index + 1];
            if (nextStopObj) {
              stopInfo.distanceToNextStop = Math.round(
                calculateDistance(
                  tracking.latitude,
                  tracking.longitude,
                  nextStopObj.latitude,
                  nextStopObj.longitude
                )
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error calculating stop info:", err);
  }

  // ============================================================
  // AUTO-GREEN logic (as before)
  // ============================================================
  const now = Date.now();
  const timeout = busSignal.autoGreenTimeOut || 20000;
  let shouldAutoGreen = false;

  if (busSignal.currentStatus === "waiting" && busSignal.readyToMovePressed) {
    const pressedAt = new Date(busSignal.readyToMovePressedTime).getTime();
    if (now - pressedAt >= timeout) shouldAutoGreen = true;
  }

  if (shouldAutoGreen) {
    console.log(`🟢 Auto-Green triggered for bus ${busId}`);

    busSignal.currentStatus = "green";
    busSignal.readyToMovePressed = false;
    busSignal.readyToMovePressedTime = null;
    busSignal.controlRoomOverride = "move";
    busSignal.reasonForRedSignal = null;
    busSignal.lastSignalChangeTime = new Date();
    await busSignal.save();

    if (io) {
      io.to(busId.toString()).emit("busSignalChange", {
        busId,
        currentStatus: "green",
        reason: "autoGreen",
      });
      io.emit("busSignalChange", {
        busId,
        currentStatus: "green",
        reason: "autoGreen",
      });
    }

    if (esp32Clients?.has(busId.toString())) {
      const client = esp32Clients.get(busId.toString());
      if (client.readyState === 1) {
        client.send(
          JSON.stringify({ busId, currentStatus: "green", reason: "autoGreen" })
        );
      }
    }
  }

  // ============================================================
  // PAIR-BUNCHING EVALUATION (prototype: pairs only)
  // - evaluate immediately
  // - schedule a re-check after 10s (non-blocking)
  // ============================================================
  try {
    // run immediately for this route
    const routeId = busDoc.busRouteId;
    if (routeId) {
      // Evaluate pairs now
      evaluatePairsOnRoute(routeId, io, esp32Clients).catch((e) =>
        console.error("evaluatePairsOnRoute error:", e)
      );

      // Schedule a re-check after RECHECK_MS
      setTimeout(() => {
        evaluatePairsOnRoute(routeId, io, esp32Clients).catch((e) =>
          console.error("evaluatePairsOnRoute (recheck) error:", e)
        );
      }, RECHECK_MS);
    }
  } catch (err) {
    console.error("Pair evaluation scheduling error:", err);
  }

  // ============================================================
  // FINAL RESPONSE (clean ApiResponse)
  // ============================================================
  const response = {
    busId: busDoc._id.toString(),
    currentStatus: busSignal.currentStatus,
    lastSignalChangeTime: busSignal.lastSignalChangeTime,
    currStop: stopInfo.currStop,
    nextStop: stopInfo.nextStop,
    distanceToNextStop: stopInfo.distanceToNextStop,
  };

  // also sync to ESP32 immediate snapshot
  try {
    if (esp32Clients?.has(busId.toString())) {
      const client = esp32Clients.get(busId.toString());
      if (client.readyState === 1) client.send(JSON.stringify(response));
    }
  } catch (e) {
    console.error("ESP32 sync error:", e);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, "Bus status fetched & updated", response));
});

export { busController };
