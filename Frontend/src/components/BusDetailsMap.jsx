import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "80vh",
};

export default function BusDetailsMap({ bus }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  if (!isLoaded) return <p>Loading map…</p>;

  const getIcon = (status) => {
    if (status === "green")
      return "http://maps.google.com/mapfiles/ms/icons/green-dot.png";
    if (status === "waiting")
      return "http://maps.google.com/mapfiles/ms/icons/yellow-dot.png";
    return "http://maps.google.com/mapfiles/ms/icons/red-dot.png";
  };

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={{ lat: bus.latitude, lng: bus.longitude }}
      zoom={16}
    >
      {/* Bus Marker */}
      <Marker
        position={{ lat: bus.latitude, lng: bus.longitude }}
        icon={{ url: getIcon(bus.currentStatus) }}
      />
    </GoogleMap>
  );
}
