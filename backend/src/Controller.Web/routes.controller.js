import { BusRoute } from "../Models/busRoutes.models.js";
import { ApiError } from "../utills/apiError.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { Bus } from "../Models/bus.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";

const calculateDistance = (lat1, long1, lat2, long2) => {
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const diffLat = toRadians(lat2 - lat1);
  const diffLong = toRadians(long2 - long1);

  const intermediateValue =
    Math.sin(diffLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(diffLong / 2) ** 2;

  const centralAngel =
    2 *
    Math.atan2(Math.sqrt(intermediateValue), Math.sqrt(1 - intermediateValue));

  return earthRadius * centralAngel;
};

const getBusRouteProgress = asyncHandler(async (req, res) => {
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
      closestStop = { ...stop, index, dist };
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

  res.status(200).json(
    new ApiResponse(200, "Bus route Fetched successfully", {
      data: {
        routeName: route.routeName,
        currStop: route.currentStop,
        nextStop: route.nextStop,
        distanceToNextStop: Math.round(closestDist),
        totalStops: route.stops.length,
        allStops: route.stops.map((s) => s.name),
      },
    })
  );
});

export { getBusRouteProgress };
