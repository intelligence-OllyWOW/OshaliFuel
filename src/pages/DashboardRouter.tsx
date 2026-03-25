import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Dashboard from './Dashboard';
import GeneralManagerDashboard from './dashboards/GeneralManagerDashboard';
import FinanceDashboard from './dashboards/FinanceDashboard';
import AdministratorDashboard from './dashboards/AdministratorDashboard';
import OperationsDashboard from './dashboards/OperationsDashboard';

export default function DashboardRouter() {
  const { profile } = useAuth();

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  switch (profile.role) {
    case 'super_admin':
      return <Dashboard />;
    case 'general_manager':
      return <GeneralManagerDashboard />;
    case 'finance':
      return <FinanceDashboard />;
    case 'administrator':
      return <AdministratorDashboard />;
    case 'operations_supervisor':
      return <OperationsDashboard />;
    case 'attendant':
      return <Navigate to="/portal/attendant" replace />;
    default:
      return <Dashboard />;
  }
}
