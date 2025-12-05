import BusMap from "../components/BusMap";
import BusCards from "../components/BusCards";

export default function Dashboard() {
  return (
    <div className="w-full p-4">
      <h1 className="text-3xl font-bold mb-4">Live Bus Dashboard</h1>

      <BusMap />

      <h2 className="text-2xl font-semibold mt-6 mb-2">All Buses</h2>
      <BusCards />
    </div>
  );
}
