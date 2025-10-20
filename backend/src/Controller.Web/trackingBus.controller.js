import { TrackingBus } from "../Models/tracking.models.js";
import { asyncHandler } from "../utills/asyncHandler.js";
import { ApiResponse } from "../utills/apiResponse.js";
import { ApiError } from "../utills/apiError.js";

const getLiveLocationOfBus = asyncHandler(async (req, res) => {
  const { busId } = req.params;
  const { latitude, longitude } = req.body;

  if (!busId || !latitude || !longitude) {
    throw new ApiError(404, "Busid, latitude, longitude are all required");
  }

  const tracking = await TrackingBus.findOneAndUpdate(
    {
      busId: busId,
    },
    { latitude: latitude, longitude: longitude },
    { new: true, upsert: true }
  );

  if (!tracking) throw new ApiError(400, "Failed to update the bus location.");

  const io = req.app.get("io");
  if (io) {
    io.emit("busLocationLiveUpdate", {
      busId,
      latitude,
      longitude,
    });
  }

  res.status(200).json(
    new ApiResponse(200, "Bus location updated successfully", {
      data: tracking,
    })
  );
});

export { getLiveLocationOfBus };
