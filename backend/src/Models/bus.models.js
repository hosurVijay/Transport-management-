import mongoose, { Schema } from "mongoose";

const busSchema = new Schema({
  busRouteId: {
    type: String,
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
    lowercase: true,
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
