import mongoose, { Schema, Types } from "mongoose";

const busRouteSchema = new Schema(
  {
    routeName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    buses: [
      {
        type: Types.ObjectId,
        ref: "Bus",
        required: true,
      },
    ],
    stops: [
      {
        type: String,
        lowercase: true,
        required: true,
      },
    ],
    totalDistance: { 
      required: false,
      default: null,
    },
    currentStop: {
      type: String,
      required: false,
      default: null,
    },
    nextStop: {
      type: String,
      required: false,
      default: null,
    },
  },
  { timestamps: true }
);

const BusRoute = mongoose.model("BusRoute", busRouteSchema);

export { BusRoute };
