import { Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import BusDetails from "./pages/BusDetails";
// import AllBusesMap from "./pages/AllBusesMap";

function App() {
  return (
    <Routes>
      {/* MAIN DASHBOARD */}
      <Route path="/" element={<Dashboard />} />

      {/* SPECIFIC BUS PAGE */}
      <Route path="/bus/:id" element={<BusDetails />} />

      {/* ALL BUSES MAP PAGE */}
      {/* <Route path="/map/all-buses" element={<AllBusesMap />} /> */}

      {/* OPTIONAL: 404 PAGE */}
      <Route path="*" element={<h1>Page Not Found</h1>} />
    </Routes>
  );
}

export default App;
