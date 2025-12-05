// controllers/bus.controller.js
import { BusSignalling } from "../Models/busSignalling.model.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { Bus } from "../Models/bus.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { calculateDistance } from "../utills/calculateDistance.js";

import { manualProtection } from "../utills/manualProtectionCache.js";

/**
 * Prototype parameters
 */
const BUNCHING_THRESHOLD_M = 1000; // 1 km
const RECHECK_MS = 10_000; // re-check after 10 seconds
const MANUAL_IGNORE_MS = 60_000; // used by manualProtection (set only by manual controller)

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
 */
function chooseLeader(p1, p2) {
  if (p1.stopIndex > p2.stopIndex) return { leader: p1, follower: p2 };
  if (p2.stopIndex > p1.stopIndex) return { leader: p2, follower: p1 };
  if (p1.distToNextStop < p2.distToNextStop)
    return { leader: p1, follower: p2 };
  return { leader: p2, follower: p1 };
}

/**
 * Helper: update BusSignalling for a bus and notify clients
 * NOTE: This function DOES NOT set manualProtection.
 * manualProtection is set only by manual controller endpoints.
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

  // do NOT set manualProtection here — only manual controller should do that
  try {
    await signalling.save();
  } catch (e) {
    console.error("save updateSignalForBus:", e);
  }

  // notify socket.io
  try {
    if (io) {
      io.to(busObjId.toString()).emit("busSignalChange", {
        busId: busObjId.toString(),
        currentStatus: newStatus,
        reason,
        conflictingBusId: conflictWith ? conflictWith.toString() : null,
        distanceFromConflictBus: distanceFromConflict ?? null,
        lastSignalChangeTime: signalling.lastSignalChangeTime,
      });
    }
  } catch (e) {
    console.error("Socket.IO emit error:", e);
  }

  // notify esp32
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
 * evaluatePairsOnRoute: pairwise bunching evaluation
 * - skips pairs if any bus is in manualProtection
 */
async function evaluatePairsOnRoute(routeId, io, esp32Clients) {
  const buses = await Bus.find({ busRouteId: routeId }).lean();
  if (!buses || buses.length < 2) return;

  const route = await BusRoute.findById(routeId);
  if (!route) return;

  const progresses = [];
  for (const b of buses) {
    const p = await computeProgressForBus(b._id, route);
    if (p) progresses.push(p);
  }
  if (progresses.length < 2) return;

  const pairs = [];
  for (let i = 0; i < progresses.length; i++) {
    for (let j = i + 1; j < progresses.length; j++) {
      const a = progresses[i],
        b = progresses[j];
      const d = calculateDistance(a.lat, a.lng, b.lat, b.lng);
      if (d <= BUNCHING_THRESHOLD_M)
        pairs.push({ a, b, distance: Math.round(d) });
    }
  }
  if (!pairs.length) return;

  // build frequency to filter clusters
  const freq = new Map();
  pairs.forEach((p) => {
    const idA = p.a.busId.toString(),
      idB = p.b.busId.toString();
    freq.set(idA, (freq.get(idA) || 0) + 1);
    freq.set(idB, (freq.get(idB) || 0) + 1);
  });

  const disjointPairs = pairs.filter((p) => {
    const idA = p.a.busId.toString(),
      idB = p.b.busId.toString();
    return freq.get(idA) === 1 && freq.get(idB) === 1;
  });
  if (!disjointPairs.length) return;

  const now = Date.now();

  for (const pair of disjointPairs) {
    const busASignal = await BusSignalling.findOne({
      busId: pair.a.busId.toString(),
    });
    const busBSignal = await BusSignalling.findOne({
      busId: pair.b.busId.toString(),
    });
    if (!busASignal || !busBSignal) continue;

    const aTerminated = busASignal.controlRoomOverride === "stop";
    const bTerminated = busBSignal.controlRoomOverride === "stop";

    const aWaiting = busASignal.currentStatus === "waiting";
    const bWaiting = busBSignal.currentStatus === "waiting";
    if (aWaiting || bWaiting) continue;

    // Skip if either bus is under manual protection
    const aProtectedUntil = manualProtection.get(pair.a.busId.toString()) || 0;
    const bProtectedUntil = manualProtection.get(pair.b.busId.toString()) || 0;
    if (now < aProtectedUntil || now < bProtectedUntil) {
      continue;
    }

    let leader, follower;
    if (aTerminated && !bTerminated) {
      leader = pair.b;
      follower = pair.a;
    } else if (bTerminated && !aTerminated) {
      leader = pair.a;
      follower = pair.b;
    } else if (aTerminated && bTerminated) {
      continue;
    } else {
      ({ leader, follower } = chooseLeader(pair.a, pair.b));
    }

    try {
      await updateSignalForBus(
        leader.busId,
        "green",
        null,
        follower.busId,
        pair.distance,
        io,
        esp32Clients
      );
    } catch (e) {
      console.error("updateSignalForBus leader error:", e);
    }

    const followerTerminated =
      follower.busId.toString() === pair.a.busId.toString()
        ? aTerminated
        : bTerminated;

    try {
      if (followerTerminated) {
        // use terminated-specific reason so it doesn't set manual protection
        await updateSignalForBus(
          follower.busId,
          "red",
          "terminatedOverride",
          leader.busId,
          pair.distance,
          io,
          esp32Clients
        );
      } else {
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
    } catch (e) {
      console.error("updateSignalForBus follower error:", e);
    }
  }
}

/**
 * Main controller function (route handler)
 */
const busController = asyncHandler(async (req, res) => {
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");

  const { busId } = req.params;
  const { latitude, longitude, readyToMove, terminated } = req.query;

  if (!busId) throw new ApiError(400, "busId is required");

  const busSignal = await BusSignalling.findOne({ busId });
  if (!busSignal) throw new ApiError(400, "No bus signalling record found");

  const busDoc = await Bus.findById(busId);
  if (!busDoc) throw new ApiError(400, "No bus found for the provided busId");

  // TERMINATE (driver stop)
  if (terminated === "true") {
    console.log(`🔴 Bus ${busId} manually terminated`);

    // keep termination logic but DO NOT set manualProtection here
    busSignal.currentStatus = "red";
    busSignal.controlRoomOverride = "stop";
    busSignal.reasonForRedSignal = "terminatedOverride"; // distinct from manualOverride
    busSignal.readyToMovePressed = false;
    busSignal.readyToMovePressedTime = null;
    try {
      busSignal.manualOverrideTimestamp = new Date();
    } catch (e) {}
    await busSignal.save();

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

    if (esp32Clients?.has(busId.toString())) {
      const client = esp32Clients.get(busId.toString());
      if (client.readyState === 1)
        client.send(
          JSON.stringify({ busId, currentStatus: "red", reason: "terminated" })
        );
    }
  }

  // READY TO MOVE
  if (readyToMove === "true") {
    console.log(`🟡 Ready-to-Move pressed by bus ${busId}`);
    if (busSignal.currentStatus === "red") {
      busSignal.currentStatus = "waiting";
      busSignal.readyToMovePressed = true;
      busSignal.readyToMovePressedTime = new Date();
      busSignal.controlRoomOverride = "wait";
      busSignal.reasonForRedSignal = null;
      await busSignal.save();

      if (io)
        io.to(busId.toString()).emit("busSignalChange", {
          busId,
          currentStatus: "waiting",
          reason: "driverReadyToMove",
        });

      if (esp32Clients?.has(busId.toString())) {
        const client = esp32Clients.get(busId.toString());
        if (client.readyState === 1)
          client.send(
            JSON.stringify({
              busId,
              currentStatus: "waiting",
              reason: "driverReadyToMove",
            })
          );
      }
      console.log(`➡ Bus ${busId} switched RED → WAITING`);
    }
  }

  // GPS update
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
      io.emit("busLocationUpdated", {
        busId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      });
    }
  }

  // Determine stops
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

  // AUTO-GREEN logic (final for Option A)
  // - Normal waiting -> autoGreen after 20s
  // - Manual red (reason === "manualOverride") -> autoGreen after 20s
  const nowCheck = Date.now();
  const baseTimeout = 20_000; // 20 seconds
  let shouldAutoGreen = false;
  const isTerminated = busSignal.controlRoomOverride === "stop";

  // Case: waiting
  if (
    !isTerminated &&
    busSignal.currentStatus === "waiting" &&
    busSignal.readyToMovePressed === true &&
    busSignal.readyToMovePressedTime
  ) {
    const pressedAt = new Date(busSignal.readyToMovePressedTime).getTime();
    if (nowCheck - pressedAt >= baseTimeout) shouldAutoGreen = true;
  }

  // Case: manual red fallback
  if (
    !isTerminated &&
    busSignal.currentStatus === "red" &&
    busSignal.reasonForRedSignal === "manualOverride"
  ) {
    const manualAge =
      nowCheck - new Date(busSignal.lastSignalChangeTime).getTime();
    if (manualAge >= baseTimeout) shouldAutoGreen = true;
  }

  if (shouldAutoGreen) {
    console.log(`🟢 Auto-Green triggered for bus ${busId}`);
    busSignal.currentStatus = "green";
    busSignal.readyToMovePressed = false;
    busSignal.readyToMovePressedTime = null;
    busSignal.controlRoomOverride = "move";
    busSignal.reasonForRedSignal = null;
    busSignal.conflictingBusId = null;
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
      if (client.readyState === 1)
        client.send(
          JSON.stringify({ busId, currentStatus: "green", reason: "autoGreen" })
        );
    }
  }

  // Run bunching evaluation now and re-check after RECHECK_MS
  try {
    const routeId = busDoc.busRouteId;
    if (routeId) {
      evaluatePairsOnRoute(routeId, io, esp32Clients).catch((e) =>
        console.error("evaluatePairsOnRoute error:", e)
      );
      setTimeout(() => {
        evaluatePairsOnRoute(routeId, io, esp32Clients).catch((e) =>
          console.error("evaluatePairsOnRoute (recheck) error:", e)
        );
      }, RECHECK_MS);
    }
  } catch (err) {
    console.error("Pair evaluation scheduling error:", err);
  }

  // Final response
  const response = {
    busId: busDoc._id.toString(),
    currentStatus: busSignal.currentStatus,
    lastSignalChangeTime: busSignal.lastSignalChangeTime,
    currStop: stopInfo.currStop,
    nextStop: stopInfo.nextStop,
    distanceToNextStop: stopInfo.distanceToNextStop,
  };

  // Sync to ESP32 snapshot
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
