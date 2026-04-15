// ─── App.tsx patch ────────────────────────────────────────────────────────────
//
// STEP 1 — Add import at the top with the other page imports:
//
//   import Expenses from './pages/Expenses';
//
//
// STEP 2 — Add the route (after the /clients route, before /users):
//
//   <Route
//     path="/expenses"
//     element={
//       <ProtectedRoute
//         allowedRoles={[
//           'super_admin',
//           'general_manager',
//           'finance',
//           'administrator',
//           'operations_supervisor',
//         ]}
//       >
//         <Layout>
//           <Expenses />
//         </Layout>
//       </ProtectedRoute>
//     }
//   />
//
//
// ─── Portal route files ───────────────────────────────────────────────────────
//
// Add <Route path="expenses" element={<Expenses />} /> inside each portal:
//
//   src/pages/portals/FinancePortal.tsx      → import Expenses; add route
//   src/pages/portals/GeneralManagerPortal.tsx → import Expenses; add route
//   src/pages/portals/AdministratorPortal.tsx  → import Expenses; add route
//   src/pages/portals/OperationsPortal.tsx     → import Expenses; add route
//
// Example (FinancePortal.tsx):
//
//   import Expenses from '../Expenses';
//
//   export default function FinancePortal() {
//     return (
//       <Routes>
//         <Route index element={<FinanceDashboard />} />
//         <Route path="procurement" element={<Procurement />} />
//         <Route path="expenses" element={<Expenses />} />     ← add this
//         <Route path="reports" element={<Reports />} />
//         <Route path="*" element={<Navigate to="/portal/finance" replace />} />
//       </Routes>
//     );
//   }
//
// Repeat the same pattern for the other three portals, using their
// respective base redirect paths (/portal/general-manager, /portal/administrator,
// /portal/operations).
