import { Bus } from "../Models/bus.models.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { BusSignalling } from "../Models/busSignalling.model.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";

export const getAllBusLive = asyncHandler(async (req, res) => {
  // Fetch all buses
  const buses = await Bus.find().lean();
  if (!buses.length)
    return res.status(200).json(new ApiResponse(200, [], "No buses found"));

  const results = [];

  for (const bus of buses) {
    const tracking = await TrackingBus.findOne({ busID: bus._id }).lean();
    const signal = await BusSignalling.findOne({ busId: bus._id }).lean();
    const route = await BusRoute.findById(bus.busRouteId).lean();

    results.push({
      busId: bus._id,
      busNumber: bus.busNumber,
      routeName: route?.routeName || "Unknown Route",
      latitude: tracking?.latitude ?? null,
      longitude: tracking?.longitude ?? null,
      currentStatus: signal?.currentStatus ?? "unknown",
      reason: signal?.reasonForRedSignal ?? "-",
      lastUpdated: signal?.lastSignalChangeTime ?? null,
    });
  }

  return res
    .status(200)
    .json(new ApiResponse(200, results, "Live bus data fetched"));
});
