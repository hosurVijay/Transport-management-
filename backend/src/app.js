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

import busSignalingRoute from "./Routes/busSignalling.routes.js";

app.use("/api/v1/bus", busSignalingRoute);
export { app };
