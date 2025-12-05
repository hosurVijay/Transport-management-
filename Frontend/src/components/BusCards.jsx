import { useEffect, useState } from "react";
import api from "../services/api";
import socket from "../socket";
import { useNavigate } from "react-router-dom";

export default function BusCards() {
  const [buses, setBuses] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/bus/getAllLiveData").then((res) => {
      setBuses(res.data.data);
    });

    socket.on("busLocationUpdated", (update) => {
      setBuses((prev) =>
        prev.map((bus) =>
          bus._id === update.busId
            ? { ...bus, latitude: update.latitude, longitude: update.longitude }
            : bus
        )
      );
    });

    socket.on("busSignalChange", (update) => {
      setBuses((prev) =>
        prev.map((bus) =>
          bus._id === update.busId
            ? { ...bus, currentStatus: update.currentStatus }
            : bus
        )
      );
    });

    return () => {
      socket.off("busLocationUpdated");
      socket.off("busSignalChange");
    };
  }, []);

  const statusColor = (s) =>
    s === "green"
      ? "text-green-600"
      : s === "waiting"
      ? "text-yellow-600"
      : "text-red-600";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
      {buses.map((bus) => (
        <div key={bus._id} className="p-4 border rounded-xl shadow-md bg-white">
          <h3 className="text-xl font-semibold">{bus.busNumber}</h3>

          <p className="mt-1">
            <strong>Current Stop: </strong>
            {bus.currStop || "Loading..."}
          </p>

          <p className="mt-1">
            <strong>Next Stop: </strong>
            {bus.nextStop || "Loading..."}
          </p>

          <p className={`mt-2 font-bold ${statusColor(bus.currentStatus)}`}>
            {bus.currentStatus.toUpperCase()}
          </p>

          <button
            onClick={() => navigate(`/bus/${bus._id}`)}
            className="mt-4 bg-blue-600 text-white px-3 py-2 rounded-lg"
          >
            View Details
          </button>
        </div>
      ))}
    </div>
  );
}
