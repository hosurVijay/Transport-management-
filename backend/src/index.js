import express from "express";
import dotenv from "dotenv";
import { app } from "./app.js";
import { connectDB } from "./db/index.js";

dotenv.config({
  path: "./.env",
});

connectDB()
  .then(() => {
    app.listen(`${process.env.PORT}|| 3000`, () => {
      console.log(
        ` Server is listening... just like she *used* to listen to me on PORT: ${process.env.PORT}`
      );
    });
  })
  .catch((error) => {
    console.log(
      `Server failed to listen... just like she did later. Try again — maybe Server will listen.`,
      error
    );
  });
