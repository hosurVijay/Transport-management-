import express from "express";
import cors from "cors";

const app = express();
app.use(
  cors({
    origin: "*",
    credentials: false,
  })
);
app.use(express.urlencoded({ limit: "16kb" }));
app.use(express.static("public"));
app.use(express.json({ limit: "16kb" }));

import busSignalingRoute from "./Routes.esp/busSignalling.routes.js";

app.use("/api/v1/bus", busSignalingRoute);
export { app };

import manualSignallingRoute from "./Routes.web/manualBusSignalling.routes.js";
app.use("/api/v1/busManual", manualSignallingRoute);

import getBusProgress from "./Routes.web/routes.route.js";
app.use("/api/v1/busProgress", getBusProgress);

import getBusLocation from "./Routes.web/trackingBus.route.js";
app.use("/api/v1/busLocation", getBusLocation);
