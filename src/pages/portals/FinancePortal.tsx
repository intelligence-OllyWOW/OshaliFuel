import { Routes, Route, Navigate } from 'react-router-dom';
import FinanceDashboard from '../dashboards/FinanceDashboard';
import Procurement from '../Procurement';
import FinanceReports from '../../components/FinanceReports';

export default function FinancePortal() {
  return (
    <Routes>
      <Route index element={<FinanceDashboard />} />
      <Route path="procurement" element={<Procurement />} />
      <Route path="reports" element={<FinanceReports />} />
      <Route path="*" element={<Navigate to="/portal/finance" replace />} />
    </Routes>
  );
}
