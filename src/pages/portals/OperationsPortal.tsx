import { Routes, Route, Navigate } from 'react-router-dom';
import OperationsDashboard from '../dashboards/OperationsDashboard';
import Inventory from '../Inventory';
import Sales from '../Sales';

export default function OperationsPortal() {
  return (
    <Routes>
      <Route index element={<OperationsDashboard />} />
      <Route path="inventory" element={<Inventory />} />
      <Route path="sales" element={<Sales />} />
      <Route path="*" element={<Navigate to="/portal/operations" replace />} />
    </Routes>
  );
}
