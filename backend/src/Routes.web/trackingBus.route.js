import { Router } from "express";
import { getLiveLocationOfBus } from "../Controller.Web/trackingBus.controller.js";

const router = Router();

router.route("/bus-tracking/:busId").get(getLiveLocationOfBus);

export default router;
