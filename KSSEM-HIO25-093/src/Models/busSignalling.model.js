import mongoose, { Schema, Types } from "mongoose";

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
      default: "red",
      required: true,
    },
    redSignalDuration: {
      type: Number,
      required: true,
      default: 20000, // Changed from 300000 (5 min) to 20000 (20 seconds) for prototype
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
      enum: ["move", "stop", "wait", null],
      default: null,
    },
    lastSignalChangeTime: {
      type: Date,
      default: Date.now,
    },
    autoGreenTimeOut: {
      type: Number,
      default: 20000, // Changed from 900000 (15 min) to 20000 (20 seconds) for prototype
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
