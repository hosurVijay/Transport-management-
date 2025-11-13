import { BusSignalling } from "../Models/busSignalling.model.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiError.js";

/* ========================================================
   MANUAL RED SIGNAL
======================================================== */
const manualRed = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params; // busId
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");

  if (!action || !id) {
    throw new ApiError(400, "Action or Bus ID is missing.");
  }

  const bus = await BusSignalling.findOne({ busId: id });
  if (!bus) throw new ApiError(400, "No bus with such ID found");

  if (bus.currentStatus === "red") {
    return res.status(200).json(
      new ApiResponse(200, "Bus already red", {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  // Update bus signal state
  bus.currentStatus = "red";
  bus.lastSignalChangeTime = new Date();
  bus.reasonForRedSignal = "manualOverride";
  await bus.save();

  // Emit to frontend via socket
  if (io) {
    io.to(bus.busId.toString()).emit("busSignalChange", {
      busId: bus.busId,
      currentStatus: "red",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
  }

  // Send to ESP32 (WebSocket)
  if (esp32Clients?.has(bus.busId.toString())) {
    const client = esp32Clients.get(bus.busId.toString());
    if (client.readyState === 1) {
      client.send(
        JSON.stringify({
          busId: bus.busId,
          currentStatus: "red",
          reason: "manualOverride",
        })
      );
      console.log(`📤 Sent MANUAL RED to ESP32 for bus ${bus.busId}`);
    }
  } else {
    console.log(`⚠️ No ESP32 client found for busId: ${bus.busId}`);
  }

  return res.status(200).json(
    new ApiResponse(200, "Status changed to RED", {
      status: bus.currentStatus,
      lastSignalChangeTime: bus.lastSignalChangeTime,
      reasonForRedSignal: bus.reasonForRedSignal,
    })
  );
});

/* ========================================================
   MANUAL GREEN SIGNAL
======================================================== */
const manualGreen = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;
  const io = req.app.get("io");
  const esp32Clients = req.app.get("esp32Clients");

  if (!action || !id) {
    throw new ApiError(400, "Action or Bus ID is missing.");
  }

  const bus = await BusSignalling.findOne({ busId: id });
  if (!bus) throw new ApiError(400, "No bus with such ID found");

  if (bus.currentStatus === "green") {
    return res.status(200).json(
      new ApiResponse(200, "Bus already green", {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
      })
    );
  }

  // Update status
  bus.currentStatus = "green";
  bus.lastSignalChangeTime = new Date();
  bus.reasonForRedSignal = null;
  await bus.save();

  // Emit to frontend UI
  if (io) {
    io.to(bus.busId.toString()).emit("busSignalChange", {
      busId: bus.busId,
      currentStatus: "green",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
  }

  // Send to ESP32
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
      console.log(`📤 Sent MANUAL GREEN to ESP32 for bus ${bus.busId}`);
    }
  }

  return res.status(200).json(
    new ApiResponse(200, "Status changed to GREEN", {
      status: bus.currentStatus,
      lastSignalChangeTime: bus.lastSignalChangeTime,
      reasonForRedSignal: bus.reasonForRedSignal,
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
