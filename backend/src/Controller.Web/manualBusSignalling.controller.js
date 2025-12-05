// src/Controller.Web/manualBusSignalling.controller.js

import { BusSignalling } from "../Models/busSignalling.model.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiError.js";
import { calculateDistance } from "../utills/calculateDistance.js";
import { manualProtection } from "../utills/manualProtectionCache.js"; // shared map

const BUNCHING_THRESHOLD_M = 1000; // 1 km
const MANUAL_PROTECT_MS = 60_000; // 60 seconds

/* ========================================================
   MANUAL RED SIGNAL
   - set manualProtection for 60s (bunching skips this bus)
   - flip nearby red followers to GREEN and protect them for 60s
   - set reasonForRedSignal = "manualOverride" for this bus
======================================================== */
const manualRed = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params; // busId (string)
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");

  if (!action || !id) {
    throw new ApiError(400, "Action or Bus ID is missing.");
  }

  const bus = await BusSignalling.findOne({ busId: id });
  if (!bus) throw new ApiError(400, "No bus with such ID found");

  // If already red, refresh protection and return
  if (bus.currentStatus === "red") {
    manualProtection.set(id.toString(), Date.now() + MANUAL_PROTECT_MS);
    // schedule cleanup
    setTimeout(() => {
      const cur = manualProtection.get(id.toString()) || 0;
      if (Date.now() >= cur) manualProtection.delete(id.toString());
    }, MANUAL_PROTECT_MS + 500);

    return res.status(200).json(
      new ApiResponse(200, "Bus already red (protected)", {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  // Protect this bus for 60s (bunching skip)
  manualProtection.set(id.toString(), Date.now() + MANUAL_PROTECT_MS);
  setTimeout(() => {
    const cur = manualProtection.get(id.toString()) || 0;
    if (Date.now() >= cur) manualProtection.delete(id.toString());
  }, MANUAL_PROTECT_MS + 500);

  // Update bus to RED (manual)
  bus.currentStatus = "red";
  bus.lastSignalChangeTime = new Date();
  bus.reasonForRedSignal = "manualOverride";
  bus.controlRoomOverride = "stop";
  bus.conflictingBusId = null;
  try {
    bus.manualOverrideTimestamp = new Date();
  } catch (e) {}
  await bus.save();

  // Emit update for this bus
  if (io) {
    io.to(id.toString()).emit("busSignalChange", {
      busId: id,
      currentStatus: "red",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
    io.emit("busSignalChange", {
      busId: id,
      currentStatus: "red",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
  }

  // Notify ESP32 if connected
  if (esp32Clients?.has(id.toString())) {
    const client = esp32Clients.get(id.toString());
    if (client.readyState === 1) {
      client.send(
        JSON.stringify({
          busId: id,
          currentStatus: "red",
          reason: "manualOverride",
        })
      );
    }
  }

  // Find and flip nearby followers on same route
  const routeId = bus.routeId;
  if (routeId) {
    // other buses on route that are RED (potential followers)
    const candidates = await BusSignalling.find({
      routeId: routeId,
      currentStatus: "red",
      busId: { $ne: id },
    }).lean();

    if (candidates && candidates.length) {
      const myTrack = await TrackingBus.findOne({ busID: id });
      if (myTrack) {
        for (const cand of candidates) {
          try {
            const candTrack = await TrackingBus.findOne({ busID: cand.busId });
            if (!candTrack) {
              console.log(
                `[manualRed] no tracking for candidate ${cand.busId}`
              );
              continue;
            }

            const dist = calculateDistance(
              myTrack.latitude,
              myTrack.longitude,
              candTrack.latitude,
              candTrack.longitude
            );

            if (dist <= BUNCHING_THRESHOLD_M) {
              console.log(
                `[manualRed] candidate follower ${cand.busId} is ${Math.round(
                  dist
                )}m away -> flipping to GREEN`
              );

              // Protect follower as well
              manualProtection.set(
                cand.busId.toString(),
                Date.now() + MANUAL_PROTECT_MS
              );
              setTimeout(() => {
                const cur = manualProtection.get(cand.busId.toString()) || 0;
                if (Date.now() >= cur)
                  manualProtection.delete(cand.busId.toString());
              }, MANUAL_PROTECT_MS + 500);

              // Update follower record to GREEN
              const followerRecord = await BusSignalling.findOne({
                busId: cand.busId,
              });
              if (followerRecord) {
                followerRecord.currentStatus = "green";
                followerRecord.reasonForRedSignal = null;
                followerRecord.controlRoomOverride = "move";
                followerRecord.conflictingBusId = null;
                try {
                  followerRecord.manualOverrideTimestamp = new Date();
                } catch (e) {}
                followerRecord.lastSignalChangeTime = new Date();
                await followerRecord.save();

                // Emit follower update
                if (io) {
                  io.to(cand.busId.toString()).emit("busSignalChange", {
                    busId: cand.busId.toString(),
                    currentStatus: "green",
                    reason: "leaderStopped",
                    lastSignalChangeTime: followerRecord.lastSignalChangeTime,
                  });
                  io.emit("busSignalChange", {
                    busId: cand.busId.toString(),
                    currentStatus: "green",
                    reason: "leaderStopped",
                    lastSignalChangeTime: followerRecord.lastSignalChangeTime,
                  });
                }

                // Notify ESP32
                if (esp32Clients?.has(cand.busId.toString())) {
                  const client = esp32Clients.get(cand.busId.toString());
                  if (client.readyState === 1) {
                    client.send(
                      JSON.stringify({
                        busId: cand.busId.toString(),
                        currentStatus: "green",
                        reason: "leaderStopped",
                      })
                    );
                  }
                }
              }
            }
          } catch (err) {
            console.error(
              "[manualRed] error processing candidate",
              cand.busId,
              err
            );
          }
        } // for candidates
      } else {
        console.log(
          "[manualRed] No tracking for manually stopped bus; cannot compute nearest followers"
        );
      }
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      "Status changed to RED (manual). Nearby followers updated if any.",
      {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      }
    )
  );
});

/* ========================================================
   MANUAL GREEN SIGNAL
   - set manualProtection for 60s (bunching skipped for this bus)
======================================================== */
const manualGreen = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");

  if (!action || !id) throw new ApiError(400, "Action or Bus ID is missing.");

  const bus = await BusSignalling.findOne({ busId: id });
  if (!bus) throw new ApiError(400, "No bus with such ID found");

  if (bus.currentStatus === "green") {
    // refresh protection
    manualProtection.set(id.toString(), Date.now() + MANUAL_PROTECT_MS);
    setTimeout(() => {
      const cur = manualProtection.get(id.toString()) || 0;
      if (Date.now() >= cur) manualProtection.delete(id.toString());
    }, MANUAL_PROTECT_MS + 500);

    return res.status(200).json(
      new ApiResponse(200, "Bus already green", {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  // Protect this bus
  manualProtection.set(id.toString(), Date.now() + MANUAL_PROTECT_MS);
  setTimeout(() => {
    const cur = manualProtection.get(id.toString()) || 0;
    if (Date.now() >= cur) manualProtection.delete(id.toString());
  }, MANUAL_PROTECT_MS + 500);

  try {
    bus.manualOverrideTimestamp = new Date();
  } catch (e) {}

  bus.currentStatus = "green";
  bus.lastSignalChangeTime = new Date();
  bus.reasonForRedSignal = null;
  bus.controlRoomOverride = "move";
  bus.conflictingBusId = null;
  await bus.save();

  if (io) {
    io.to(bus.busId.toString()).emit("busSignalChange", {
      busId: bus.busId,
      currentStatus: "green",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
    io.emit("busSignalChange", {
      busId: bus.busId,
      currentStatus: "green",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
  }

  if (esp32Clients?.has(bus.busId.toString())) {
    const client = esp32Clients.get(bus.busId.toString());
    if (client.readyState === 1) {
      client.send(
        JSON.stringify({
          busId: bus.busId,
          currentStatus: "green",
          reason: "manualOverride",
        })
      );
    }
  }

  return res.status(200).json(
    new ApiResponse(200, "Status changed to GREEN", {
      status: bus.currentStatus,
      lastSignalChangeTime: bus.lastSignalChangeTime,
    })
  );
});

/* ========================================================
   GET BUS STATUS
======================================================== */
const getBusStatus = asyncHandler(async (req, res) => {
  const { id } = req.params; // busId
  if (!id) throw new ApiError(400, "Bus ID is required");

  const bus = await BusSignalling.findOne({ busId: id });
  if (!bus) throw new ApiError(404, "No signalling data found for this bus ID");

  return res.status(200).json(
    new ApiResponse(200, "Bus status fetched successfully", {
      busId: bus.busId,
      currentStatus: bus.currentStatus,
      lastSignalChangeTime: bus.lastSignalChangeTime,
      reasonForRedSignal: bus.reasonForRedSignal,
    })
  );
});

export { manualGreen, manualRed, getBusStatus };
