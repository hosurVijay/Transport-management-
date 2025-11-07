import { BusSignalling } from "../Models/busSignalling.model.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiError.js";

const manualRed = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients"); // Get ESP32 clients

  if (!action || !id) {
    throw new ApiError(400, "Action or ID is missing.");
  }

  const bus = await BusSignalling.findOne({ busId: id });

  if (!bus) {
    throw new ApiError(400, "No bus with such ID found");
  }

  if (bus.currentStatus === "red") {
    return res.status(200).json(
      new ApiResponse(200, "Bus already red", {
        data: {
          status: bus.currentStatus,
          lastSignalChangeTime: bus.lastSignalChangeTime,
        },
      })
    );
  }

  bus.currentStatus = "red";
  bus.lastSignalChangeTime = new Date();
  bus.reasonForRedSignal = "manualOverride";

  await bus.save();

  // Socket.IO emit for web clients
  if (io) {
    io.to(bus._id.toString()).emit("busSignalChange", {
      busId: bus._id.toString(),
      currentStatus: "red",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
  }

  // WebSocket broadcast to ESP32 (ADDED)
  if (esp32Clients && esp32Clients.has(bus.busId.toString())) {
    const client = esp32Clients.get(bus.busId.toString());
    if (client.readyState === 1) {
      // WebSocket.OPEN
      client.send(
        JSON.stringify({
          busId: bus.busId.toString(),
          currentStatus: "red",
          reason: "manualOverride",
        })
      );
      console.log(`📤 Sent MANUAL RED to ESP32: ${bus.busId}`);
    }
  } else {
    console.log(`⚠️ No ESP32 client found for busId: ${bus.busId}`);
  }

  res.status(200).json(
    new ApiResponse(200, "Status changed to RED", {
      data: {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
        reasonForRedSignal: bus.reasonForRedSignal,
      },
    })
  );
});

const manualGreen = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients"); // Get ESP32 clients

  if (!action || !id) {
    throw new ApiError(400, "Action or ID is missing.");
  }

  const bus = await BusSignalling.findOne({ busId: id });

  if (!bus) {
    throw new ApiError(400, "No bus with such ID found");
  }

  if (bus.currentStatus === "green") {
    return res.status(200).json(
      new ApiResponse(200, "Bus already green", {
        data: {
          status: bus.currentStatus,
          lastSignalChangeTime: bus.lastSignalChangeTime,
        },
      })
    );
  }

  bus.currentStatus = "green";
  bus.lastSignalChangeTime = new Date();
  bus.reasonForRedSignal = null;

  await bus.save();

  // Socket.IO emit for web clients
  if (io) {
    io.to(bus._id.toString()).emit("busSignalChange", {
      busId: bus._id.toString(),
      currentStatus: "green",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
  }

  // WebSocket broadcast to ESP32 (ADDED)
  if (esp32Clients && esp32Clients.has(bus.busId.toString())) {
    const client = esp32Clients.get(bus.busId.toString());
    if (client.readyState === 1) {
      // WebSocket.OPEN
      client.send(
        JSON.stringify({
          busId: bus.busId.toString(),
          currentStatus: "green",
          reason: "manualOverride",
        })
      );
      console.log(`📤 Sent MANUAL GREEN to ESP32: ${bus.busId}`);
    }
  } else {
    console.log(`⚠️ No ESP32 client found for busId: ${bus.busId}`);
  }

  res.status(200).json(
    new ApiResponse(200, "Status changed to GREEN", {
      data: {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
        reasonForRedSignal: bus.reasonForRedSignal,
      },
    })
  );
});

const getBusStatus = asyncHandler(async (req, res) => {
  const { id } = req.params; // this is busId

  if (!id) {
    throw new ApiError(400, "Bus ID is required");
  }

  // 🔍 Find signalling data using busId, not Mongo _id
  const bus = await BusSignalling.findOne({ busId: id });

  if (!bus) {
    throw new ApiError(404, "No signalling data found for this bus ID");
  }

  res.status(200).json(
    new ApiResponse(200, "Bus status fetched successfully", {
      data: {
        busId: bus.busId,
        currentStatus: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
        reasonForRedSignal: bus.reasonForRedSignal || null,
      },
    })
  );
});

export { manualGreen, manualRed, getBusStatus };
