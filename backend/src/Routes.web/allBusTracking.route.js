import { Router } from "express";
import { getAllBusLive } from "../Controller.Web/allBusTracking.controller.js";

const router = Router();

router.get("/live", getAllBusLive);

export default router;
