import mongoose, { Schema, Types } from "mongoose";

const trackingBus = new Schema(
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
