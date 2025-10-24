import { Router } from "express";
import {
  manualRed,
  manualGreen,
} from "../Controller.Web/manualBusSignalling.controller.js";

const router = Router();

router.route("/manaul-red/:busID").post(manualRed);
router.route("/manaul-green/budId").post(manualGreen);

export default router;
