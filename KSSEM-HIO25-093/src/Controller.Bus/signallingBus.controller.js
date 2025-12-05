// controllers/bus.controller.js
import { BusSignalling } from "../Models/busSignalling.model.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { Bus } from "../Models/bus.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { calculateDistance } from "../utills/calculateDistance.js";

const busController = asyncHandler(async (req, res) => {                   
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");
  const { busId } = req.params;
  const { latitude, longitude, readyToMove, terminated } = req.query;

  if (!busId) throw new ApiError(400, "busId is required");

  const bus = await BusSignalling.findOne({ busId });
  if (!bus) throw new ApiError(400, "No bus found");

  // ===========================================================
  // 🔴 TERMINATE LOGIC (STOP BUTTON)
  // ===========================================================
  if (terminated === "true") {
    console.log(`🔴 Bus ${busId} terminated by driver`);

    bus.currentStatus = "red";
    bus.controlRoomOverride = "stop";
    bus.reasonForRedSignal = "manualOverride";
    bus.readyToMovePressed = false;
    bus.readyToMovePressedTime = null;

    await bus.save();

    io.emit("busSignalChange", {
      busId,
      currentStatus: "red",
      reason: "terminated",
    });

    // Send to ESP32
    if (esp32Clients?.has(busId.toString())) {
      const client = esp32Clients.get(busId.toString());
      if (client.readyState === 1)
        client.send(
          JSON.stringify({ busId, currentStatus: "red", reason: "terminated" })
        );
    }
  }

  // ===========================================================
  // 🟡 READY-TO-MOVE LOGIC (YELLOW WAITING)
  // ===========================================================
  if (readyToMove === "true") {
    console.log(`🟡 Ready-to-Move triggered for bus ${busId}`);

    if (bus.currentStatus === "red") {
      bus.currentStatus = "waiting"; // yellow
      bus.readyToMovePressed = true;
      bus.readyToMovePressedTime = new Date();
      bus.controlRoomOverride = "wait";
      bus.reasonForRedSignal = null;

      await bus.save();

      io.emit("busSignalChange", {
        busId,
        currentStatus: "waiting",
        reason: "driverReadyToMove",
      });

      // Notify ESP32
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

      console.log(`Bus ${busId} switched from RED → WAITING`);
    }
  }

  // ===========================================================
  // 📍 GPS UPDATE
  // ===========================================================
  if (latitude && longitude) {
    await TrackingBus.findOneAndUpdate(
      { busID: busId },
      { latitude: parseFloat(latitude), longitude: parseFloat(longitude) },
      { new: true, upsert: true }
    );

    io.emit("busLocationUpdated", {
      busId,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    });
  }

  // ===========================================================
  // 🚏 DETERMINE CURRENT & NEXT STOP
  // ===========================================================
  let stopInfo = {
    currStop: "Unknown",
    nextStop: "Unknown",
    distanceToNextStop: 0,
  };

  try {
    const tracking = await TrackingBus.findOne({ busID: busId });
    if (tracking) {
      const busDoc = await Bus.findById(busId);
      if (busDoc?.busRouteId) {
        const route = await BusRoute.findById(busDoc.busRouteId);
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

          const threshold = 20;
          if (closestStop) {
            if (closestDist <= threshold) {
              stopInfo.currStop = closestStop.name;
              stopInfo.nextStop = route.stops[closestStop.index + 1]
                ? route.stops[closestStop.index + 1].name
                : "Final Stop";
            } else {
              stopInfo.currStop = closestStop.name;
              stopInfo.nextStop = route.stops[closestStop.index + 1]
                ? route.stops[closestStop.index + 1].name
                : "Final Stop";
            }

            const nextStopObj = route.stops.find(
              (s) => s.name === stopInfo.nextStop
            );
            if (nextStopObj)
              stopInfo.distanceToNextStop = Math.round(
                calculateDistance(
                  tracking.latitude,
                  tracking.longitude,
                  nextStopObj.latitude,
                  nextStopObj.longitude
                )
              );

            console.log("==============================================");
            console.log(`📍 Current stop: ${stopInfo.currStop}`);
            console.log(`➡️ Next stop: ${stopInfo.nextStop}`);
            console.log(`📏 Distance: ${stopInfo.distanceToNextStop} m`);
            console.log("==============================================");
          }
        }
      }
    }
  } catch (err) {
    console.error("Error calculating stop info:", err);
  }

  // ===========================================================
  // ⏱️ AUTO-GREEN LOGIC
  // ===========================================================
  const now = Date.now();
  const timeout = bus.autoGreenTimeOut || 20000;
  let shouldAutoGreen = false;

  if (bus.currentStatus === "waiting" && bus.readyToMovePressed) {
    const ref = new Date(bus.readyToMovePressedTime).getTime();
    if (now - ref >= timeout) shouldAutoGreen = true;
  }

  if (shouldAutoGreen) {
    console.log(`🟢 Auto-Green triggered for bus ${busId}`);
    bus.currentStatus = "green";
    bus.readyToMovePressed = false;
    bus.readyToMovePressedTime = null;
    bus.controlRoomOverride = "move";
    bus.reasonForRedSignal = null;
    bus.lastSignalChangeTime = new Date();
    await bus.save();

    io.emit("busSignalChange", {
      busId,
      currentStatus: "green",
      reason: "autoGreen",
    });

    if (esp32Clients?.has(busId.toString())) {
      const client = esp32Clients.get(busId.toString());
      if (client.readyState === 1)
        client.send(
          JSON.stringify({ busId, currentStatus: "green", reason: "autoGreen" })
        );
    }
  }

  // ===========================================================
  // 📤 FINAL RESPONSE
  // ===========================================================
  const response = {
    busId: bus.busId,
    currentStatus: bus.currentStatus,
    lastSignalChangeTime: bus.lastSignalChangeTime,
    currStop: stopInfo.currStop,
    nextStop: stopInfo.nextStop,
    distanceToNextStop: stopInfo.distanceToNextStop,
  };

  // Always sync with ESP32
  if (esp32Clients?.has(busId.toString())) {
    const client = esp32Clients.get(busId.toString());
    if (client.readyState === 1) client.send(JSON.stringify(response));
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, "Bus status fetched & updated", { data: response })
    );
});

export { busController };
