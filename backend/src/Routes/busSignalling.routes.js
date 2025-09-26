import express, { Router } from "express";
import { busController } from "../Controller/busSignalling.controller.js";

const router = Router();

router.route("/bus-signal").post(busController);

export default router;
