import mongoose, { Types } from "mongoose";

const busSignalling = new Schema(
  {
    busId: {
      type: Types.ObjectId,
      ref: "Bus",
      required: true,
      unique: true,
    },

    currentStatus: {
      type: String,
      enum: ["green", "red", "waiting"],
      default: "green",
      required: true,
    },
    redSignalDuration: {
      type: Number,
      required: true,
      default: 300000,
    },
    readyToMovePressed: {
      type: Boolean,
      default: false,
    },
    readyToMovePressedTime: {
      type: Date,
      default: null,
    },
    controlRoomOverride: {
      type: String,
      enum: ["move", "stop", null],
      default: null,
    },
    lastSignalChangeTime: {
      type: Date,
      default: Date.now,
    },
    autoGreenTimeOut: {
      type: Number,
      default: 900000,
    },
    conflictingBusId: {
      type: Types.ObjectId,
      ref: "Bus",
      default: null,
    },
    distanceFromConflictBus: {
      type: Number,
      default: null,
    },
    routeId: {
      type: Types.ObjectId,
      ref: "BusRoute",
      required: true,
    },
    conflictPriority: {
      type: Number,
      default: null,
    },
    distanceToNextStop: {
      type: Number,
      default: null,
    },
    nextStopCoordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
    reasonForRedSignal: {
      type: String,
      enum: ["busBunching", "controlRoomStop", "manualOverride"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const BusSignalling = mongoose.model("BusSignalling", busSignalling);

export { BusSignalling };
