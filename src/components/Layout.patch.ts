// ─── Layout.tsx patch ────────────────────────────────────────────────────────
//
// Apply the following changes to src/components/Layout.tsx
//
// STEP 1 — Add Wallet to the lucide-react import:
//
//   import {
//     ...,
//     Wallet,      // ← add this
//   } from 'lucide-react';
//
//
// STEP 2 — Add to the top-level navItems array (after the 'Clients' entry):
//
//   {
//     label: 'Expenses',
//     path: '/expenses',
//     icon: <Wallet strokeWidth={1} />,
//     roles: ['super_admin', 'general_manager', 'finance', 'administrator', 'operations_supervisor'],
//   },
//
//
// STEP 3 — Add to portalNavItems.finance (after the 'Procurement' entry):
//
//   {
//     label: 'Expenses',
//     path: '/portal/finance/expenses',
//     icon: <Wallet strokeWidth={1} />,
//     roles: ['finance'],
//   },
//
//
// STEP 4 — Add to portalNavItems.general_manager (after 'Clients'):
//
//   {
//     label: 'Expenses',
//     path: '/portal/general-manager/expenses',
//     icon: <Wallet strokeWidth={1} />,
//     roles: ['general_manager'],
//   },
//
//
// STEP 5 — Add to portalNavItems.administrator (after 'Sales'):
//
//   {
//     label: 'Expenses',
//     path: '/portal/administrator/expenses',
//     icon: <Wallet strokeWidth={1} />,
//     roles: ['administrator'],
//   },
//
//
// STEP 6 — Add to portalNavItems.operations_supervisor (after 'Sales'):
//
//   {
//     label: 'Expenses',
//     path: '/portal/operations/expenses',
//     icon: <Wallet strokeWidth={1} />,
//     roles: ['operations_supervisor'],
//   },
