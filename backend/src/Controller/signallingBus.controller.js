import { Bus } from "../Models/bus.models.js";
import { BusRoute } from "../Models/busRoutes.models/js";
import { BusSignalling } from "../Models/busSignalling.model.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { uptime } from "process";
import { time } from "console";

const getStatusOfCurrentBus = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  const bus = await BusSignalling.findOne({ busId });

  if (!bus) {
    throw new ApiError(400, "No bus found");
  }

  res.status(200).json(new ApiResponse(200, "Status fetched successfull", bus));
});

const readyToMovePressed = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const findBus = await BusSignalling.findOne({ busId });
  if (!findBus) {
    throw new ApiError(400, "No bus found");
  }

  if (findBus.currentStatus === "green") {
    throw new ApiError(400, "Already Green, Ready to Move");
  }

  if (findBus.readyToMovePressed) {
    res
      .status(200)
      .json(new ApiResponse(200, "Already Pressed, wait for cleareance"));
  }
  findBus.currentStatus = "waiting";
  findBus.readyToMovePressed = true;
  findBus.lastSignalChangeTime = Date.now();
  findBus.controlRoomOverride = "wait";
  findBus.readyToMovePressedTime = Date.now();

  await findBus.save();

  res
    .status(200)
    .json(new ApiResponse(200, "Wait for further clerance", findBus));
});

const autoGreenSet = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const bus = await BusSignalling.findOne({ busId });

  if (!bus) {
    throw new ApiError(400, "no bus found");
  }

  if (bus.currentStatus === "waiting" && bus.readyToMovePressed === true) {
    const currentTime = Date.now();

    const timeDifference = currentTime - bus.readyToMovePressedTime;

    if (timeDifference > 20000) {
      bus.currentStatus = "green";
      bus.readyToMovePressed = false;
      await bus.save();
    }
  }

  res.status(200).json(new ApiResponse(200, "Ready to move", bus));
});

const setSignalGreen = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const bus = await BusSignalling.findOne({ busId });
  if (!bus) {
    throw new ApiError(400, "No bus found");
  }
  if (bus.readyToMovePressed) {
    bus.currentStatus = "green";
    bus.lastSignalChangeTime = Date.now();
    bus.readyToMovePressed = false;
    bus.controlRoomOverride = "move";
    await bus.save();
  }

  res.status(200).json(200, "Ready TO move", bus);
});
export {
  getStatusOfCurrentBus,
  readyToMovePressed,
  setSignalGreen,
  autoGreenSet,
};
