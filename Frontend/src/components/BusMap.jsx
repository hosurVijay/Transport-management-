import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useState } from "react";
import api from "../services/api";
import socket from "../socket";
import { useNavigate } from "react-router-dom";

const containerStyle = {
  width: "100%",
  height: "60vh",
};

const defaultCenter = { lat: 12.9716, lng: 77.5946 };

export default function BusMap() {
  const navigate = useNavigate();
  const [buses, setBuses] = useState([]);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  useEffect(() => {
    // initial load
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

  const getIcon = (status) => {
    if (status === "green")
      return "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
    if (status === "waiting")
      return "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
    return "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
  };

  if (!isLoaded) return <p>Loading...</p>;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={13}
    >
      {buses.map(
        (bus) =>
          bus.latitude &&
          bus.longitude && (
            <Marker
              key={bus._id}
              position={{ lat: bus.latitude, lng: bus.longitude }}
              icon={{ url: getIcon(bus.currentStatus) }}
              onClick={() => navigate(`/bus/${bus._id}`)}
              label={bus.busNumber}
            />
          )
      )}
    </GoogleMap>
  );
}
