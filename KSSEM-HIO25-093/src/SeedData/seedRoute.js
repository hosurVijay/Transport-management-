import { connectDB } from "../db/index.js";
import { BusRoute } from "../Models/busRoutes.models.js";
import dotenv from "dotenv";
import path from "path";

// explicitly resolve .env from backend root
dotenv.config({ path: path.resolve("../../.env") });

const preDefinedRoutes = [
  {
    routeName: "Route A - KSIT to Banashankari",
    stops: [
      { name: "KSIT College", latitude: 12.8684, longitude: 77.5731 },
      { name: "Konanakunte Cross", latitude: 12.8917, longitude: 77.5661 },
      { name: "Banashankari Bus Stop", latitude: 12.9179, longitude: 77.5739 },
    ],
    totalDistance: 9.5,
    currentStop: null,
    nextStop: null,
  },
  {
    routeName: "Route B - KSIT to Majestic",
    stops: [
      { name: "KSIT College", latitude: 12.8684, longitude: 77.5731 },
      { name: "JP Nagar 6th Phase", latitude: 12.8966, longitude: 77.5854 },
      { name: "Majestic Bus Stand", latitude: 12.9779, longitude: 77.5713 },
    ],
    totalDistance: 15.2,
    currentStop: null,
    nextStop: null,
  },
  {
    routeName: "Route C - KSIT to Electronic City",
    stops: [
      { name: "KSIT College", latitude: 12.8684, longitude: 77.5731 },
      { name: "Nice Road Junction", latitude: 12.8779, longitude: 77.5925 },
      { name: "Electronic City", latitude: 12.8452, longitude: 77.6602 },
    ],
    totalDistance: 18.0,
    currentStop: null,
    nextStop: null,
  },
];

const seedRoutes = async () => {
  try {
    await connectDB();
    await BusRoute.deleteMany(); // clear old routes
    const insertedRoutes = await BusRoute.insertMany(preDefinedRoutes);
    console.log("Routes seeded:", insertedRoutes);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seedRoutes();
