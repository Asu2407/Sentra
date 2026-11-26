import { Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { ControlRoom } from "./pages/ControlRoom.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/approve/:id" element={<Dashboard />} />
      <Route path="/control-room" element={<ControlRoom />} />
    </Routes>
  );
}
