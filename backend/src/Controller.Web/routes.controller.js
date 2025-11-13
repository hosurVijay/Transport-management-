import { BusRoute } from "../Models/busRoutes.models.js";
import { ApiError } from "../utills/apiError.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { Bus } from "../Models/bus.models.js";
import { calculateDistance } from "../utills/calculateDistance.js";

const getBusRouteProgres = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  if (!busId) throw new ApiError(400, "Bus ID is required");

  // tracking data
  const tracking = await TrackingBus.findOne({ busID: busId });
  if (!tracking) throw new ApiError(400, "No tracking data found for this bus");

  // bus
  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Bus not found");

  // route
  const route = await BusRoute.findById(bus.busRouteId._id);
  if (!route) throw new ApiError(404, "Route not found");

  // fix 129716 → 12.9716
  const normalize = (val) => (val > 1000 ? val / 10000 : val);

  let closestStop = null;
  let closestDist = Infinity;

  route.stops.forEach((stop, index) => {
    const dist = calculateDistance(
      normalize(tracking.latitude),
      normalize(tracking.longitude),
      normalize(stop.latitude),
      normalize(stop.longitude)
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
      : "Final stop reached";
  } else {
    currStop =
      closestStop.index > 0
        ? route.stops[closestStop.index].name
        : route.stops[0].name;

    nextStop =
      closestStop.index < route.stops.length - 1
        ? route.stops[closestStop.index + 1].name
        : "Final stop reached";
  }

  const liveData = {
    routeName: route.routeName,
    currStop,
    nextStop,
    distanceToNextStop: Math.round(closestDist),
    totalStops: route.stops.length,
    allStops: route.stops.map((s) => s.name),
  };

  const io = req.app.get("io");
  if (io) {
    io.to(busId).emit("busRouteUpdate", liveData);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, "Live update sent successfully", liveData));
});

export { getBusRouteProgres };
