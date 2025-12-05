import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../services/api";
import socket from "../socket";
import BusDetailsMap from "../components/BusDetailsMap";

export default function BusDetails() {
  const { id } = useParams();
  const [bus, setBus] = useState(null);

  // ===========================
  // FETCH BUS STATUS INITIALLY
  // ===========================
  useEffect(() => {
    api.get(`/bus/getBusStatus/${id}`).then((res) => {
      setBus(res.data.data);
    });

    socket.emit("joinBusRoom", id);

    // LIVE UPDATES
    socket.on("busSignalChange", (update) => {
      if (update.busId === id) {
        setBus((prev) => ({ ...prev, currentStatus: update.currentStatus }));
      }
    });

    socket.on("busLocationUpdated", (update) => {
      if (update.busId === id) {
        setBus((prev) => ({
          ...prev,
          latitude: update.latitude,
          longitude: update.longitude,
        }));
      }
    });

    return () => {
      socket.off("busSignalChange");
      socket.off("busLocationUpdated");
    };
  }, [id]);

  if (!bus) return <p className="p-4 text-xl">Loading…</p>;

  const sendManualRed = async () => {
    await api.post(`/bus/manualRed/${id}`, { action: "red" });
  };

  const sendManualGreen = async () => {
    await api.post(`/bus/manualGreen/${id}`, { action: "green" });
  };

  const statusColor =
    bus.currentStatus === "green"
      ? "text-green-600"
      : bus.currentStatus === "waiting"
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div className="flex flex-col md:flex-row w-full h-full p-4 gap-4">
      {/* LEFT SIDE — MAP */}
      <div className="md:w-3/4 w-full">
        <BusDetailsMap bus={bus} />
      </div>

      {/* RIGHT SIDE — INFO PANEL */}
      <div className="md:w-1/3 w-full bg-white shadow-lg rounded-xl p-6 border">
        <h1 className="text-3xl font-bold mb-4">{bus.busId}</h1>

        <p>
          <strong>Status: </strong>
          <span className={`font-semibold ${statusColor}`}>
            {bus.currentStatus.toUpperCase()}
          </span>
        </p>

        <p className="mt-2">
          <strong>Current Stop: </strong>
          {bus.currStop}
        </p>
        <p className="mt-1">
          <strong>Next Stop: </strong>
          {bus.nextStop}
        </p>

        <p className="mt-2">
          <strong>Latitude:</strong> {bus.latitude}
        </p>
        <p className="mt-1">
          <strong>Longitude:</strong> {bus.longitude}
        </p>

        <p className="mt-2">
          <strong>Distance to Next Stop:</strong> {bus.distanceToNextStop}{" "}
          meters
        </p>

        <div className="mt-6 flex gap-4">
          <button
            onClick={sendManualRed}
            className="bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            STOP (Red)
          </button>

          <button
            onClick={sendManualGreen}
            className="bg-green-600 text-white px-4 py-2 rounded-lg"
          >
            GO (Green)
          </button>
        </div>
      </div>
    </div>
  );
}
