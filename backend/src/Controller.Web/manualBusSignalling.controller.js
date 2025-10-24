import { BusSignalling } from "../Models/busSignalling.model.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiResponse.js";

const manualRed = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;
  const io = req.app.get("io"); // get io instance

  if (!action || !id) {
    throw new ApiError(400, "Action or ID is missing.");
  }

  const bus = await BusSignalling.findById(id);

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

  if (io) {
    io.to(bus._id.toString()).emit("busSignalChange", {
      busId: bus._id.toString(),
      currentStatus: "red",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
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
  const io = req.app.get("io"); // get io instance

  if (!action || !id) {
    throw new ApiError(400, "Action or ID is missing.");
  }

  const bus = await BusSignalling.findById(id);

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

  if (io) {
    io.to(bus._id.toString()).emit("busSignalChange", {
      busId: bus._id.toString(),
      currentStatus: "green",
      reason: "manualOverride",
      lastSignalChangeTime: bus.lastSignalChangeTime,
    });
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

export { manualGreen, manualRed };
