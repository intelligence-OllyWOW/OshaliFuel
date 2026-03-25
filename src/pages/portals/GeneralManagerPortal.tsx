import { Routes, Route, Navigate } from 'react-router-dom';
import GeneralManagerDashboard from '../dashboards/GeneralManagerDashboard';
import Procurement from '../Procurement';
import Inventory from '../Inventory';
import Sales from '../Sales';
import Pricing from '../Pricing';
import Clients from '../Clients';

export default function GeneralManagerPortal() {
  return (
    <Routes>
      <Route index element={<GeneralManagerDashboard />} />
      <Route path="procurement" element={<Procurement />} />
      <Route path="inventory" element={<Inventory />} />
      <Route path="sales" element={<Sales />} />
      <Route path="pricing" element={<Pricing />} />
      <Route path="clients" element={<Clients />} />
      <Route path="*" element={<Navigate to="/portal/general-manager" replace />} />
    </Routes>
  );
}
