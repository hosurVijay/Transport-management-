import { Bus } from "../Models/bus.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { BusSignalling } from "../Models/busSignalling.model.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiResponse.js";

const manualRed = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const { id } = req.params;

  if (!action || !id) {
    throw new ApiError(400, "Action or ID is Missing.");
  }

  const bus = await BusSignalling.findById(id);

  if (!bus) {
    throw new ApiError(400, "NO bus with such id found ");
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

  if (bus.currentStatus === "green" || bus.currentStatus === "waiting") {
    bus.currentStatus = "red";
    bus.lastSignalChangeTime = new Date();
    bus.reasonForRedSignal = "manualOverride";

    await bus.save();
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

  if (!action || !id) {
    throw new ApiError("Action or id is missing");
  }

  const bus = await BusSignalling.findById(id);

  if (bus.currentStatus === "green") {
    return res.status(200).json(
      new ApiResponse(200, "Already green", {
        data: {
          status: bus.currentStatus,
          lastSignalChangeTime: bus.lastSignalChangeTime,
          reasonForRedSignal: null,
        },
      })
    );
  }

  if (bus.currentStatus === "red" || bus.currentStatus === "waiting") {
    bus.currentStatus = "green";
    bus.lastSignalChangeTime = new Date();
    reasonForRedSignal = null;
    await bus.save();
  }

  res.status(200).json(
    new ApiResponse(200, "Status changed to Green", {
      data: {
        status: bus.currentStatus,
        lastSignalChangeTime: bus.lastSignalChangeTime,
        reasonForRedSignal: bus.reasonForRedSignal,
      },
    })
  );
});

export { manualGreen, manualRed };
