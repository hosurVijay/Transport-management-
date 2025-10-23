import { BusRoute } from "../Models/busRoutes.models.js";
import { ApiError } from "../utills/apiError.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { Bus } from "../Models/bus.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import { calculateDistance } from "../utills/calculateDistance.js";

const getBusRouteProgres = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  if (!busId) {
    throw new ApiError(400, "bus ID is required");
  }

  const tracking = await TrackingBus.findOne({ busID: busId });

  if (!tracking) throw new ApiError(400, "No such bus found!");

  const bus = await Bus.findById(busId).populate("routeId");

  const route = await BusRoute.findById(bus.busRouteId._id);

  if (!route) throw new ApiError(404, "Route not found");

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

  let currStop = null;
  let nextStop = null;

  if (closestDist <= 40) {
    currStop = closestStop.name;
    nextStop = route.stops[closestStop.index + 1]
      ? route.stops[closestStop.index + 1].name
      : "something went wrong!";
  } else {
    currStop =
      closestStop.index > 0
        ? route.stops[closestStop.index + 1].name
        : route.stops[0].name;
  }

  const liveData = {
    routeName: route.routeName,
    currStop: route.currentStop,
    nextStop: route.nextStop,
    distanceToNextStop: Math.round(closestDist),
    totalStops: route.stops.length,
    allStops: route.stops.map((s) => s.name),
  };

  const io = req.app.get("io");
  if (io) {
    io.to(busId).emit("busRouteUpdate", liveData);
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, "Live update sent successfully", { data: liveData })
    );
});

export { getBusRouteProgres, calculateDistance };
