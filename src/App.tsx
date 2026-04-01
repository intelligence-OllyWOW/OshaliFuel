import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TestingModeProvider } from './contexts/TestingModeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import OshaliLoader from './components/OshaliLoader';
import Login from './pages/Login';
import Setup from './pages/Setup';
import DashboardRouter from './pages/DashboardRouter';
import Procurement from './pages/Procurement';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Pricing from './pages/Pricing';
import Users from './pages/Users';
import Clients from './pages/Clients';
import Expenses from './pages/Expenses';
import GeneralManagerPortal from './pages/portals/GeneralManagerPortal';
import FinancePortal from './pages/portals/FinancePortal';
import AdministratorPortal from './pages/portals/AdministratorPortal';
import OperationsPortal from './pages/portals/OperationsPortal';
import AttendantPortal from './pages/portals/AttendantPortal';
import Settings from './pages/Settings';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';

function AppContent() {
  const { loading } = useAuth();
  if (loading) return <OshaliLoader variant="fullscreen" message="Starting up..." />;

  return (
    <TestingModeProvider>
      <PWAUpdatePrompt />
      <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardRouter />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/procurement"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'general_manager', 'finance', 'administrator', 'operations_supervisor']}>
                <Layout>
                  <Procurement />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'general_manager', 'administrator', 'operations_supervisor']}>
                <Layout>
                  <Inventory />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'general_manager', 'administrator', 'operations_supervisor', 'pump_attendant']}>
                <Layout>
                  <Sales />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pricing"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'general_manager']}>
                <Layout>
                  <Pricing />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'general_manager']}>
                <Layout>
                  <Clients />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute
                allowedRoles={[
                  'super_admin',
                  'general_manager',
                  'finance',
                  'administrator',
                  'operations_supervisor',
                ]}
              >
                <Layout>
                  <Expenses />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <Layout>
                  <Users />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/general-manager/*"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'general_manager']}>
                <Layout>
                  <GeneralManagerPortal />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/finance/*"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'finance']}>
                <Layout>
                  <FinancePortal />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/administrator/*"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'administrator']}>
                <Layout>
                  <AdministratorPortal />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/operations/*"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'operations_supervisor']}>
                <Layout>
                  <OperationsPortal />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/portal/attendant"
            element={
              <ProtectedRoute allowedRoles={['super_admin', 'attendant', 'pump_attendant']}>
                <Layout>
                  <AttendantPortal />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    </TestingModeProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
