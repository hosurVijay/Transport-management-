import { Router } from "express";
import {
  manualRed,
  manualGreen,
  getBusStatus,
} from "../Controller.Web/manualBusSignalling.controller.js";

const router = Router();

router.route("/manual-red/:id").post(manualRed);
router.route("/manual-green/:id").post(manualGreen);
router.route("/get-status/:id").post(getBusStatus);

export default router;
