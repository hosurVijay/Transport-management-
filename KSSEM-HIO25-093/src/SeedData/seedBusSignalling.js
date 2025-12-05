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

    // Delete all existing bus signalling records
    const deletedCount = await BusSignalling.deleteMany();
    console.log(
      `Deleted ${deletedCount.deletedCount} existing bus signalling records`
    );

    const getAllBuses = await Bus.find();

    if (getAllBuses.length === 0) {
      throw new ApiError(400, "No buses found to create signalling for.");
    }

    console.log(`Found ${getAllBuses.length} buses to create signalling for`);

    // Create bus signalling records for all buses
    const signallingPromises = getAllBuses.map(async (bus) => {
      try {
        const newSignalling = await BusSignalling.create({
          busId: bus._id,
          routeId: bus.busRouteId,
        });
        console.log(
          `Bus signalling created for bus number: ${bus.busNumber} (ID: ${bus._id})`
        );
        return newSignalling;
      } catch (error) {
        console.error(
          `Failed to create signalling for bus ${bus.busNumber}:`,
          error.message
        );
        return null;
      }
    });

    const results = await Promise.allSettled(signallingPromises);
    const successful = results.filter(
      (result) => result.status === "fulfilled" && result.value
    ).length;
    const failed = results.length - successful;

    console.log(`\nBus signalling seeding completed!`);
    console.log(`Successfully created: ${successful} records`);
    if (failed > 0) {
      console.log(`Failed to create: ${failed} records`);
    }

    process.exit(0);
  } catch (error) {
    console.error("Bus signalling seeding failed:", error.message);
    process.exit(1);
  }
};

seedingBusSignalling();
