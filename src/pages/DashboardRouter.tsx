import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import Dashboard from './Dashboard';
import GeneralManagerDashboard from './dashboards/GeneralManagerDashboard';
import FinanceDashboard from './dashboards/FinanceDashboard';
import AdministratorDashboard from './dashboards/AdministratorDashboard';
import OperationsDashboard from './dashboards/OperationsDashboard';

export default function DashboardRouter() {
  const { profile } = useAuth();

  if (!profile) return <OshaliLoader variant="fullscreen" />;

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
