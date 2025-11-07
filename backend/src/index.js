import dotenv from "dotenv";
import { app } from "./app.js";
import { connectDB } from "./db/index.js";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { WebSocketServer } from "ws"; // Add this import

dotenv.config({
  path: "./.env",
});

// Use number from .env or fallback to 3000
const PORT = process.env.PORT || 8000;
const WS_PORT = process.env.WS_PORT || 8080; // WebSocket port for ESP32

connectDB()
  .then(() => {
    const httpServer = createServer(app);

    // Socket.IO setup (for web clients - keep this!)
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
        console.log(`Socket ${socket.id} joined Room ${busId}`);
      });

      socket.on("disconnect", () => {
        console.log("Client disconnect: ", socket.id);
      });
    });

    app.set("io", io);

    // ============================================
    // WebSocket Server for ESP32 (ADD THIS SECTION)
    // ============================================
    const wss = new WebSocketServer({ port: WS_PORT });
    const esp32Clients = new Map();

    wss.on("connection", (ws) => {
      console.log("✓ ESP32 device connected via WebSocket");

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message.toString());

          if (data.busId) {
            esp32Clients.set(data.busId, ws);
            console.log(`✓ ESP32 registered with busId: ${data.busId}`);

            // Send confirmation
            ws.send(
              JSON.stringify({
                type: "registered",
                busId: data.busId,
                message: "Successfully registered",
              })
            );
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      });

      ws.on("close", () => {
        // Remove disconnected client
        for (const [busId, client] of esp32Clients.entries()) {
          if (client === ws) {
            esp32Clients.delete(busId);
            console.log(`✗ ESP32 disconnected: ${busId}`);
            break;
          }
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });
    });

    // Make WebSocket clients available to controllers
    app.set("wss", wss);
    app.set("esp32Clients", esp32Clients);

    console.log(`WebSocket server for ESP32 running on port ${WS_PORT}`);
    // ============================================
    // END OF WEBSOCKET SECTION
    // ============================================

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is listening on PORT: ${PORT}`);
      console.log(`Socket.IO for web clients on port: ${PORT}`);
      console.log(`WebSocket for ESP32 on port: ${WS_PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Server failed to start. Try again.`, error);
  });
