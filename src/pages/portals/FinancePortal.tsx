import { Routes, Route, Navigate } from 'react-router-dom';
import FinanceDashboard from '../dashboards/FinanceDashboard';
import Procurement from '../Procurement';

function Reports() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-light mb-6">Financial Reports</h1>
      <div className="bg-gray-50 rounded-xl p-12 text-center">
        <p className="text-gray-500 font-light">Reports module coming soon</p>
      </div>
    </div>
  );
}

export default function FinancePortal() {
  return (
    <Routes>
      <Route index element={<FinanceDashboard />} />
      <Route path="procurement" element={<Procurement />} />
      <Route path="reports" element={<Reports />} />
      <Route path="*" element={<Navigate to="/portal/finance" replace />} />
    </Routes>
  );
}
