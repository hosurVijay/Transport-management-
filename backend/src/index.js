import express from "express";
import dotenv from "dotenv";
import { app } from "./app.js";
import { connectDB } from "./db/index.js";

dotenv.config({
  path: "./.env",
});

// Use number from .env or fallback to 3000
const PORT = process.env.PORT || 8000;

connectDB()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is listening on PORT: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Server failed to start. Try again.`, error);
  });
