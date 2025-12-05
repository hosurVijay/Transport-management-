import { connectDB } from "../db/index.js";
import { Bus } from "../Models/bus.models.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import dotenv from "dotenv";
import path from "path";

// explicitly resolve .env from backend root
dotenv.config({ path: path.resolve("../../.env") });

const seedBuses = async () => {
  try {
    await connectDB();

    const routes = await BusRoute.find();
    if (routes.length < 3) {
      console.log("Need 3 routes. Please run seedRoutes first.");
      process.exit(1);
    }

    await Bus.deleteMany();

    const busesToSeed = [
      {
        busRouteId: routes[0]._id,
        timing: new Date("2025-09-24T08:00:00"),
        busNumber: "KA-05-KS-101",
        status: "readyToMove",
      },
      {
        busRouteId: routes[0]._id,
        timing: new Date("2025-09-24T09:00:00"),
        busNumber: "KA-05-KS-102",
        status: "stopped",
      },
      {
        busRouteId: routes[1]._id,
        timing: new Date("2025-09-24T08:30:00"),
        busNumber: "KA-05-KS-103",
        status: "readyToMove",
      },
      {
        busRouteId: routes[2]._id,
        timing: new Date("2025-09-24T10:00:00"),
        busNumber: "KA-05-KS-104",
        status: "stopped",
      },
    ];

    // Insert buses
    const insertedBuses = await Bus.insertMany(busesToSeed);
    console.log("Buses seeded successfully:", insertedBuses);

    for (let bus of insertedBuses) {
      await BusRoute.findByIdAndUpdate(
        bus.busRouteId,
        { $push: { buses: bus._id } },
        { new: true }
      );
    }
    console.log("Routes updated with their buses!");
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

seedBuses();
