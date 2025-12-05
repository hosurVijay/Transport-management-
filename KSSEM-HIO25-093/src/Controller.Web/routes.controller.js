import { BusRoute } from "../Models/busRoutes.models.js";
import { ApiError } from "../utills/apiError.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { TrackingBus } from "../Models/tracking.models.js";
import { Bus } from "../Models/bus.models.js";
import { calculateDistance } from "../utills/calculateDistance.js";

const getBusRouteProgres = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  if (!busId) {
    throw new ApiError(400, "Bus ID is required");
  }

  // Find tracking record for this bus
  const tracking = await TrackingBus.findOne({ busID: busId });
  if (!tracking) throw new ApiError(400, "No tracking data found for this bus");

  // Find bus info
  const bus = await Bus.findById(busId);
  if (!bus) throw new ApiError(404, "Bus not found");

  // Find bus route
  const route = await BusRoute.findById(bus.busRouteId._id);
  if (!route) throw new ApiError(404, "Route not found");

  // Helper to fix bad coordinate scaling (e.g., 129716 -> 12.9716)
  const normalize = (val) => (val > 1000 ? val / 10000 : val);

  let closestStop = null;
  let closestDist = Infinity;

  // Loop through all stops and find the closest one
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

  // Debugging (remove later)
  console.log("📍 Tracking & Stop Data:");
  console.log({
    trackingLat: tracking.latitude,
    trackingLong: tracking.longitude,
    normalizedTrackingLat: normalize(tracking.latitude),
    normalizedTrackingLong: normalize(tracking.longitude),
    closestStop: closestStop?.name || "N/A",
    closestDist: closestDist,
  });

  let currStop = null;
  let nextStop = null;

  // Determine if bus is currently at a stop
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

  // Prepare live data packet
  const liveData = {
    routeName: route.routeName,
    currStop: currStop,
    nextStop: nextStop,
    distanceToNextStop: Math.round(closestDist),
    totalStops: route.stops.length,
    allStops: route.stops.map((s) => s.name),
  };

  // Emit through Socket.IO if connected
  const io = req.app.get("io");
  if (io) {
    io.to(busId).emit("busRouteUpdate", liveData);
  }

  // Send response
  res
    .status(200)
    .json(
      new ApiResponse(200, "Live update sent successfully", { data: liveData })
    );
});

export { getBusRouteProgres };
