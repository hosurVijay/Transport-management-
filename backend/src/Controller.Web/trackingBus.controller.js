import { TrackingBus } from "../Models/tracking.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiError.js";

const getLiveLocationOfBus = asyncHandler(async (req, res) => {
  const { busId } = req.params;

  if (!busId) throw new ApiError(400, "Bus ID is required");

  const tracking = await TrackingBus.findOne({ busID: busId }); // 🧠 notice `busID`

  if (!tracking) throw new ApiError(404, "No tracking data found for this bus");

  const { latitude, longitude, updatedAt } = tracking;

  const io = req.app.get("io");
  if (io) {
    io.emit("busLocationLiveUpdate", {
      busId,
      latitude,
      longitude,
      updatedAt,
    });
  }

  res.status(200).json(
    new ApiResponse(200, "Bus live location fetched successfully", {
      busId,
      latitude,
      longitude,
      updatedAt,
    })
  );
});

export { getLiveLocationOfBus };
