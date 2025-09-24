import { connectDB } from "../db/index.js";
import { Bus } from "../Models/bus.models.js";
import { BusSignalling } from "../Models/busSignalling.model.js";
import { ApiError } from "../utills/apiError.js";
import dotenv from "dotenv";
import path from "path";

// explicitly resolve .env from backend root
dotenv.config({ path: path.resolve("../../.env") });

const seedingBusSignalling = async () => {
  try {
    await connectDB();
    await BusSignalling.deleteMany();

    const getAllBuses = await Bus.find();

    if (!getAllBuses) {
      throw new ApiError(400, "NO buses to be fetched.");
    }

    for (let bus of getAllBuses) {
      const existedBusSignal = await BusSignalling.findOne({ busId: bus._id });
      if (!existedBusSignal) {
        await BusSignalling.create({
          busId: bus._id,
          routeId: bus.busRouteId,
        });
        console.log(
          `The bus signalling is created for the bus number ${bus.busNumber}`
        );
      }
    }
    console.log("Bus signalling seeding done sucessFully");
    process.exit(0);
  } catch (error) {
    console.log("Bus signalling seeding failed", error);
    process.exit(1);
  }
};

seedingBusSignalling();
