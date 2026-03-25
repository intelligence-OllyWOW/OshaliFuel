import { Routes, Route, Navigate } from 'react-router-dom';
import AdministratorDashboard from '../dashboards/AdministratorDashboard';
import Procurement from '../Procurement';
import Inventory from '../Inventory';
import Sales from '../Sales';

export default function AdministratorPortal() {
  return (
    <Routes>
      <Route index element={<AdministratorDashboard />} />
      <Route path="procurement" element={<Procurement />} />
      <Route path="inventory" element={<Inventory />} />
      <Route path="sales" element={<Sales />} />
      <Route path="*" element={<Navigate to="/portal/administrator" replace />} />
    </Routes>
  );
}
