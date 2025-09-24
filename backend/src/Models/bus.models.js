import mongoose, { Schema, Types } from "mongoose";

const busSchema = new Schema({
  busRouteId: {
    type: Types.ObjectId,
    ref: "BusRoute",
    required: true,
    trim: true,
    lowercase: true,
  },
  timing: {
    type: Date,
    required: true,
  },
  busNumber: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    uppercase: true,
  },
  status: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  lastUpdated: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const Bus = mongoose.model("Bus", busSchema);

export { Bus };
