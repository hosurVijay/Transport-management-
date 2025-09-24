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

export { app };
