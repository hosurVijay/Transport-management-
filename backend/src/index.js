import dotenv from "dotenv";
import { app } from "./app.js";
import { connectDB } from "./db/index.js";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
dotenv.config({
  path: "./.env",
});

// Use number from .env or fallback to 3000
const PORT = process.env.PORT || 8000;

connectDB()
  .then(() => {
    const httpServer = createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["POST", "GET"],
      },
    });

    io.on("connection", (socket) => {
      console.log("New client connected: ", socket.id);

      socket.on("joinBusRoom", (busId) => {
        socket.join(busId);
        console.log(`Socket ${socket.id} joined Romm ${busId}`);
      });

      socket.on("disconnect", () => {
        console.log("Clinent disconnect: ", socket.id);
      });
    });

    app.set("io", io);

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is listening on PORT: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Server failed to start. Try again.`, error);
  });
