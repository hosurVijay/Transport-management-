import { Router } from "express";
import {
  getAllBus,
  getBusById,
} from "../Controller.Web/webDashBoard.controller.js";

const router = Router();

router.route("/getAllBus").get(getAllBus);
router.route("/getBusId/:id").get(getBusById);

export default router;
