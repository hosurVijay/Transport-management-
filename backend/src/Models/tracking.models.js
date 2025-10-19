import mongoose, { model, Schema, Types } from "mongoose";

const trackingBusSchema = new Schema(
  {
    busID: {
      type: Types.ObjectId,
      ref: "Bus",
      required: true,
      unique: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const TrackingBus = mongoose.model("TrackingBus", trackingBusSchema);

export { TrackingBus };
