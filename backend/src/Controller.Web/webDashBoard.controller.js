import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiError } from "../utills/apiError.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { Bus } from "../Models/bus.models.js";

const getAllBus = asyncHandler(async (req, res) => {
  const getallBus = await Bus.find();

  if (getallBus.length === 0) throw new ApiError(400, "No bus found");

  res.status(200).json(new ApiResponse(200, getallBus, "Success"));
});

const getBusById = asyncHandler(async (req, res) => {
  const busId = req.params.id;

  if (!busId) {
    throw new ApiError(404, "No bus with such id found");
  }
  const bus = await Bus.findById(busId);

  if (!bus) throw new ApiError(400, "something went wrong");

  res.status(200).json(new ApiResponse(200, bus, "success"));
});

export { getAllBus, getBusById };
