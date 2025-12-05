import { Router } from "express";
import { getBusRouteProgres } from "../Controller.Web/routes.controller.js";

const router = Router();

router.route("/getProgress/:busId").get(getBusRouteProgres);

export default router;
