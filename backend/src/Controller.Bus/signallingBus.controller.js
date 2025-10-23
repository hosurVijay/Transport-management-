import { Bus } from "../Models/bus.models.js";
import { BusSignalling } from "../Models/busSignalling.model.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { calculateDistance } from "../utills/calculateDistance.js";

const busController = asyncHandler(async (req, res) => {
  let busId, action, latitude, longitude;

  if (req.method === "GET") {
    busId = req.params.busId;
    action = "status";
  } else if (req.method === "POST") {
    busId = req.body.busId;
    action = req.body.action;
    latitude = req.body.latitude;
    longitude = req.body.longitude;
  } else {
    throw new ApiError(405, "Method not allowed. Use GET or POST only.");
  }

  if (!busId) {
    throw new ApiError(400, "busId is required");
  }

  const bus = await BusSignalling.findOne({ busId });
  if (!bus) {
    throw new ApiError(400, "No bus found");
  }

  const currentTime = new Date().getTime(); // Use UTC timestamp
  const timeout = bus.autoGreenTimeOut || 20000; // fallback to 20s

  if (latitude && longitude) {
    await TrackingBus.findOneAndUpdate(
      { busID: busId },
      { latitude: latitude, longitude: longitude },
      { new: true, upsert: true }
    );
  }

  const route = await BusRoute.findOne({ buses: busId }).populate("buses");

  if (route) {
    const allBusesOnRoute = await TrackingBus.find({
      busID: { $in: route.buses.map((bus) => bus._id) },
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

      for (const follower of followers) {
        await BusSignalling.findOneAndUpdate(
          { busId: follower.bus.busID },
          {
            currentStatus: "red",
            controlRoomOverride: "Stop",
            reasonForRedSignal: "busBunching",
            lastSignalChangeTime: new Date(),
          }
        );
      }
    }
  }

  // --- AUTO GREEN LOGIC ---
  let shouldAutoGreen = false;
  let referenceTime = null;

  // Case 1: Bus is waiting and ready to move button was pressed
  if (
    bus.currentStatus === "waiting" &&
    bus.readyToMovePressed === true &&
    bus.readyToMovePressedTime
  ) {
    referenceTime = new Date(bus.readyToMovePressedTime).getTime();
    const timeDiff = currentTime - referenceTime;
    console.log(
      `Waiting auto-green check: ${timeDiff}ms passed, need ${timeout}ms`
    );
    if (timeDiff >= timeout) {
      shouldAutoGreen = true;
    }
  }

  // Case 2: Bus is red due to manual override
  if (
    bus.currentStatus === "red" &&
    bus.reasonForRedSignal === "manualOverride" &&
    bus.lastSignalChangeTime
  ) {
    referenceTime = new Date(bus.lastSignalChangeTime).getTime();
    const timeDiff = currentTime - referenceTime;
    console.log(
      `Red auto-green check: ${timeDiff}ms passed, need ${timeout}ms`
    );
    if (timeDiff >= timeout) {
      shouldAutoGreen = true;
    }
  }

  // Apply auto-green if conditions are met
  if (shouldAutoGreen) {
    console.log(
      `AUTO-GREEN TRIGGERED! Bus ${busId} turning green after ${timeout}ms`
    );
    bus.currentStatus = "green";
    bus.readyToMovePressed = false;
    bus.controlRoomOverride = "move";
    bus.reasonForRedSignal = null;
    bus.lastSignalChangeTime = new Date(); // This will be stored as UTC in MongoDB
    bus.readyToMovePressedTime = null; // Reset the pressed time
    await bus.save();

    const cleanResponse = {
      busId: bus.busId,
      currentStatus: bus.currentStatus,
      currentAction: bus.controlRoomOverride,
      readyToMovePressed: bus.readyToMovePressed,
      autoGreenTimeOut: bus.autoGreenTimeOut,
      lastSignalChangeTime: bus.lastSignalChangeTime,
      ...(bus.reasonForRedSignal && {
        reasonForRedSignal: bus.reasonForRedSignal,
      }),
      ...(bus.readyToMovePressedTime && {
        readyToMovePressedTime: bus.readyToMovePressedTime,
      }),
    };

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          "Auto-green activated - Ready to move",
          cleanResponse
        )
      );
  }

  // --- ACTIONS ---
  if (action === "status") {
    const cleanResponse = {
      busId: bus.busId,
      currentStatus: bus.currentStatus,
      currentAction: bus.controlRoomOverride,
      readyToMovePressed: bus.readyToMovePressed,
      autoGreenTimeOut: bus.autoGreenTimeOut,
      lastSignalChangeTime: bus.lastSignalChangeTime,
      ...(bus.reasonForRedSignal && {
        reasonForRedSignal: bus.reasonForRedSignal,
      }),
      ...(bus.readyToMovePressedTime && {
        readyToMovePressedTime: bus.readyToMovePressedTime,
      }),
    };

    return res
      .status(200)
      .json(new ApiResponse(200, "Status fetched successfully", cleanResponse));
  }

  if (action === "ready") {
    if (bus.currentStatus === "green") {
      throw new ApiError(400, "Already Green, Ready to Move");
    }

    if (bus.readyToMovePressed) {
      return res
        .status(200)
        .json(new ApiResponse(200, "Already Pressed, wait for clearance", bus));
    }

    bus.currentStatus = "waiting";
    bus.readyToMovePressed = true;
    bus.readyToMovePressedTime = new Date(); // UTC time
    bus.lastSignalChangeTime = new Date(); // UTC time
    bus.controlRoomOverride = "wait";

    await bus.save();
    return res.status(200).json(
      new ApiResponse(200, "Wait for further clearance", {
        busId: bus.busId,
        currentStatus: bus.currentStatus,
        currentAction: bus.controlRoomOverride,
        readyToMovePressed: bus.readyToMovePressed,
        autoGreenTimeOut: bus.autoGreenTimeOut,
        readyToMovePressedTime: bus.readyToMovePressedTime,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  if (action === "green") {
    bus.currentStatus = "green";
    bus.lastSignalChangeTime = new Date(); // UTC time
    bus.readyToMovePressed = false;
    bus.readyToMovePressedTime = null;
    bus.controlRoomOverride = "move";
    bus.reasonForRedSignal = null;

    await bus.save();
    return res.status(200).json(
      new ApiResponse(200, "Ready to move", {
        busId: bus.busId,
        currentStatus: bus.currentStatus,
        currentAction: bus.controlRoomOverride,
        readyToMovePressed: bus.readyToMovePressed,
        autoGreenTimeOut: bus.autoGreenTimeOut,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  if (action === "red") {
    bus.currentStatus = "red";
    bus.lastSignalChangeTime = new Date(); // UTC time
    bus.readyToMovePressed = false;
    bus.readyToMovePressedTime = null;
    bus.controlRoomOverride = "stop";
    bus.reasonForRedSignal = "manualOverride";

    await bus.save();
    return res.status(200).json(
      new ApiResponse(200, "Stop, Wait for clearance", {
        busId: bus.busId,
        currentStatus: bus.currentStatus,
        currentAction: bus.controlRoomOverride,
        readyToMovePressed: bus.readyToMovePressed,
        autoGreenTimeOut: bus.autoGreenTimeOut,
        reasonForRedSignal: bus.reasonForRedSignal,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  throw new ApiError(400, "Invalid action. Use: status, ready, green, or red");
});

export { busController };
