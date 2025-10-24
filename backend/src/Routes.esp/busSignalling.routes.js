import express, { Router } from "express";
import { busController } from "../Controller.Bus/signallingBus.controller.js";

const router = Router();

// POST: ESP32 sends actions like "ready"
router.route("/bus-signal").post(busController);

// GET: ESP32 fetches current bus status
router.route("/bus-signal/:busId").get(busController);

export default router;
