// controllers/bus.controller.js
import { BusSignalling } from "../Models/busSignalling.model.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { calculateDistance } from "../utills/calculateDistance.js";

// --- Main ESP Bus Controller (automated updates only) ---
const busController = asyncHandler(async (req, res) => {
  const io = req.app.get("io");
  const { busId, latitude, longitude } = req.body;

  if (!busId) throw new ApiError(400, "busId is required");

  const bus = await BusSignalling.findOne({ busId });
  if (!bus) throw new ApiError(400, "No bus found");

  // --- Update live location from ESP ---
  if (latitude && longitude) {
    await TrackingBus.findOneAndUpdate(
      { busID: busId },
      { latitude, longitude },
      { new: true, upsert: true }
    );

    io.emit("busLocationUpdated", { busId, latitude, longitude });
  }

  // --- Bus Clustering Logic (auto green/red) ---
  const route = await BusRoute.findOne({ buses: busId }).populate("buses");
  if (route) {
    const allBusesOnRoute = await TrackingBus.find({
      busID: { $in: route.buses.map((b) => b._id) },
    });

    const processed = new Set();
    const clusters = [];

    for (const currentBus of allBusesOnRoute) {
      if (processed.has(currentBus.busID.toString())) continue;

      let nearestBus = null;
      let nearestDistance = Infinity;

      for (const otherBus of allBusesOnRoute) {
        if (currentBus.busID.toString() === otherBus.busID.toString()) continue;
        if (processed.has(otherBus.busID.toString())) continue;

        const distance = calculateDistance(
          currentBus.latitude,
          currentBus.longitude,
          otherBus.latitude,
          otherBus.longitude
        );

        if (distance < 1 && distance < nearestDistance) {
          nearestDistance = distance;
          nearestBus = otherBus;
        }
      }

      if (nearestBus) {
        clusters.push([
          { bus: currentBus, distance: 0 },
          { bus: nearestBus, distance: nearestDistance },
        ]);

        processed.add(currentBus.busID.toString());
        processed.add(nearestBus.busID.toString());
      }
    }

    for (const cluster of clusters) {
      cluster.sort((a, b) => a.distance - b.distance);

      const leader = cluster[0];
      const followers = cluster.slice(1);

      await BusSignalling.findOneAndUpdate(
        { busId: leader.bus.busID },
        {
          currentStatus: "green",
          controlRoomOverride: "move",
          reasonForRedSignal: null,
          lastSignalChangeTime: new Date(),
        }
      );

      io.emit("busSignalChange", {
        busId: leader.bus.busID,
        currentStatus: "green",
        reason: "High priority",
      });

      for (const follower of followers) {
        await BusSignalling.findOneAndUpdate(
          { busId: follower.bus.busID },
          {
            currentStatus: "red",
            controlRoomOverride: "stop",
            reasonForRedSignal: "busBunching",
            lastSignalChangeTime: new Date(),
          }
        );

        io.emit("busSignalChange", {
          busId: follower.bus.busID,
          currentStatus: "red",
          reason: "busBunching",
        });
      }
    }
  }

  // --- Auto-Green Logic ---
  const currentTime = new Date().getTime();
  const timeout = bus.autoGreenTimeOut || 20000;
  let shouldAutoGreen = false;

  if (
    bus.currentStatus === "waiting" &&
    bus.readyToMovePressed &&
    bus.readyToMovePressedTime
  ) {
    const referenceTime = new Date(bus.readyToMovePressedTime).getTime();
    if (currentTime - referenceTime >= timeout) shouldAutoGreen = true;
  }

  if (shouldAutoGreen) {
    bus.currentStatus = "green";
    bus.readyToMovePressed = false;
    bus.controlRoomOverride = "move";
    bus.reasonForRedSignal = null;
    bus.lastSignalChangeTime = new Date();
    bus.readyToMovePressedTime = null;

    await bus.save();

    io.emit("busSignalChange", {
      busId: bus.busId,
      currentStatus: "green",
      reason: "autoGreen",
    });
  }

  // Return ESP-friendly response
  res.status(200).json(
    new ApiResponse(200, "Bus status updated", {
      data: {
        busId: bus.busId,
        currentStatus: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      },
    })
  );
});

export { busController };
