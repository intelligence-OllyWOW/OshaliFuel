import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTestingMode } from '../contexts/TestingModeContext';
import {
  LayoutDashboard,
  FileText,
  Package,
  Receipt,
  Bell,
  LogOut,
  Menu,
  X,
  DollarSign,
  Users,
  Briefcase,
  ShieldCheck,
  UserCog,
  Settings,
  UserCircle,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { UserRole } from '../lib/database.types';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

interface Portal {
  id: UserRole | 'super_admin_portal';
  label: string;
  icon: React.ReactNode;
  description: string;
}

const portals: Portal[] = [
  {
    id: 'super_admin_portal',
    label: 'Super Admin',
    icon: <ShieldCheck className="w-4 h-4" strokeWidth={1} />,
    description: 'System administration',
  },
  {
    id: 'general_manager',
    label: 'General Manager',
    icon: <Briefcase className="w-4 h-4" strokeWidth={1} />,
    description: 'Operations overview',
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: <DollarSign className="w-4 h-4" strokeWidth={1} />,
    description: 'Financial management',
  },
  {
    id: 'administrator',
    label: 'Administrator',
    icon: <UserCog className="w-4 h-4" strokeWidth={1} />,
    description: 'Daily operations',
  },
  {
    id: 'operations_supervisor',
    label: 'Operations Supervisor',
    icon: <Settings className="w-4 h-4" strokeWidth={1} />,
    description: 'Operational oversight',
  },
  {
    id: 'attendant',
    label: 'Attendant',
    icon: <FileText className="w-4 h-4" strokeWidth={1} />,
    description: 'Create delivery notes',
  },
];

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    icon: <LayoutDashboard strokeWidth={1} />,
    roles: ['super_admin', 'general_manager', 'finance', 'administrator', 'operations_supervisor', 'pump_attendant'],
  },
  {
    label: 'Procurement',
    path: '/procurement',
    icon: <FileText strokeWidth={1} />,
    roles: ['super_admin', 'general_manager', 'finance', 'administrator', 'operations_supervisor'],
  },
  {
    label: 'Inventory',
    path: '/inventory',
    icon: <Package strokeWidth={1} />,
    roles: ['super_admin', 'general_manager', 'administrator', 'operations_supervisor'],
  },
  {
    label: 'Sales',
    path: '/sales',
    icon: <Receipt strokeWidth={1} />,
    roles: ['super_admin', 'general_manager', 'administrator', 'operations_supervisor', 'pump_attendant'],
  },
  {
    label: 'Pricing',
    path: '/pricing',
    icon: <DollarSign strokeWidth={1} />,
    roles: ['super_admin', 'general_manager'],
  },
  {
    label: 'Clients',
    path: '/clients',
    icon: <UserCircle strokeWidth={1} />,
    roles: ['super_admin', 'general_manager'],
  },
  {
    label: 'Users',
    path: '/users',
    icon: <Users strokeWidth={1} />,
    roles: ['super_admin'],
  },
  {
    label: 'System Settings',
    path: '/settings',
    icon: <Settings strokeWidth={1} />,
    roles: ['super_admin'],
  },
];

const portalNavItems: Record<string, NavItem[]> = {
  general_manager: [
    {
      label: 'Dashboard',
      path: '/portal/general-manager',
      icon: <LayoutDashboard strokeWidth={1} />,
      roles: ['general_manager'],
    },
    {
      label: 'Procurement',
      path: '/portal/general-manager/procurement',
      icon: <FileText strokeWidth={1} />,
      roles: ['general_manager'],
    },
    {
      label: 'Inventory',
      path: '/portal/general-manager/inventory',
      icon: <Package strokeWidth={1} />,
      roles: ['general_manager'],
    },
    {
      label: 'Sales',
      path: '/portal/general-manager/sales',
      icon: <Receipt strokeWidth={1} />,
      roles: ['general_manager'],
    },
    {
      label: 'Pricing',
      path: '/portal/general-manager/pricing',
      icon: <DollarSign strokeWidth={1} />,
      roles: ['general_manager'],
    },
    {
      label: 'Clients',
      path: '/portal/general-manager/clients',
      icon: <UserCircle strokeWidth={1} />,
      roles: ['general_manager'],
    },
  ],
  finance: [
    {
      label: 'Dashboard',
      path: '/portal/finance',
      icon: <LayoutDashboard strokeWidth={1} />,
      roles: ['finance'],
    },
    {
      label: 'Procurement',
      path: '/portal/finance/procurement',
      icon: <FileText strokeWidth={1} />,
      roles: ['finance'],
    },
    {
      label: 'Reports',
      path: '/portal/finance/reports',
      icon: <Receipt strokeWidth={1} />,
      roles: ['finance'],
    },
  ],
  administrator: [
    {
      label: 'Dashboard',
      path: '/portal/administrator',
      icon: <LayoutDashboard strokeWidth={1} />,
      roles: ['administrator'],
    },
    {
      label: 'Procurement',
      path: '/portal/administrator/procurement',
      icon: <FileText strokeWidth={1} />,
      roles: ['administrator'],
    },
    {
      label: 'Inventory',
      path: '/portal/administrator/inventory',
      icon: <Package strokeWidth={1} />,
      roles: ['administrator'],
    },
    {
      label: 'Sales',
      path: '/portal/administrator/sales',
      icon: <Receipt strokeWidth={1} />,
      roles: ['administrator'],
    },
  ],
  operations_supervisor: [
    {
      label: 'Dashboard',
      path: '/portal/operations',
      icon: <LayoutDashboard strokeWidth={1} />,
      roles: ['operations_supervisor'],
    },
    {
      label: 'Inventory',
      path: '/portal/operations/inventory',
      icon: <Package strokeWidth={1} />,
      roles: ['operations_supervisor'],
    },
    {
      label: 'Sales',
      path: '/portal/operations/sales',
      icon: <Receipt strokeWidth={1} />,
      roles: ['operations_supervisor'],
    },
  ],
  attendant: [
    {
      label: 'Delivery Notes',
      path: '/portal/attendant',
      icon: <FileText strokeWidth={1} />,
      roles: ['attendant'],
    },
  ],
};

export default function Layout({ children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const { isTestingMode } = useTestingMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const getSelectedPortalFromPath = (): UserRole | 'super_admin_portal' => {
    if (location.pathname.startsWith('/portal/general-manager')) return 'general_manager';
    if (location.pathname.startsWith('/portal/finance')) return 'finance';
    if (location.pathname.startsWith('/portal/administrator')) return 'administrator';
    if (location.pathname.startsWith('/portal/operations')) return 'operations_supervisor';
    if (location.pathname.startsWith('/portal/attendant')) return 'attendant';
    return 'super_admin_portal';
  };

  const selectedPortal = getSelectedPortalFromPath();

  const isSuperAdmin = profile?.role === 'super_admin';
  const isMobile = profile?.role === 'pump_attendant' || profile?.role === 'operations_supervisor' || profile?.role === 'attendant';

  const currentNavItems = isSuperAdmin
    ? selectedPortal === 'super_admin_portal'
      ? []
      : portalNavItems[selectedPortal] || []
    : [];

  const filteredNavItems = navItems.filter((item) =>
    profile ? item.roles.includes(profile.role) : false
  );

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-white">
      {isTestingMode && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white py-2 px-4">
          <div className="flex items-center justify-center gap-2 text-sm font-thin">
            <FlaskConical className="w-4 h-4 animate-pulse" strokeWidth={2} />
            <span>The system is being worked on</span>
          </div>
        </div>
      )}
      {!isMobile && (
        <aside
          className={`fixed ${isTestingMode ? 'top-10 bottom-0' : 'inset-y-0'} left-0 z-50 transform transition-all duration-300 lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${sidebarCollapsed ? 'w-20' : 'w-64'}`}
        >
          {sidebarCollapsed ? (
            <div className="flex flex-col h-full">
              {/* Logo above the pill — clickable to expand */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
                <img
                  src="/oshali-logo-icon.png"
                  alt="Oshali"
                  style={{ width: '44px', height: '44px', objectFit: 'contain' }}
                  onClick={() => setSidebarCollapsed(false)}
                  className="cursor-pointer"
                />
              </div>

              {/* Nav pill — no logo inside */}
              <div
                className="flex flex-col bg-sidebar-bg shadow-2xl"
                style={{ flex: 1, margin: '0 12px 12px', borderRadius: '24px' }}
              >
                <nav className="flex-1 pt-3 px-2 pb-2 space-y-1 overflow-y-auto">
                  {filteredNavItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center justify-center p-3 rounded-xl text-sm font-light transition-all duration-200 ${
                          isActive
                            ? 'bg-brand-gold text-brand-navy'
                            : 'text-white hover:bg-sidebar-hover'
                        }`}
                        title={item.label}
                      >
                        <div className="w-5 h-5 flex-shrink-0">{item.icon}</div>
                      </Link>
                    );
                  })}
                </nav>

                <div className="p-2">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center justify-center p-3 w-full text-sm font-light text-white hover:bg-red-800 rounded-xl transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-5 h-5" strokeWidth={1} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full bg-white border-r border-gray-100">
              <div className="flex flex-col justify-center p-6 pb-4 border-b border-gray-100">
                <div className="flex items-center justify-center w-full mb-2">
                  <img
                    src="/oshali-logo.png"
                    alt="Oshali Fuel"
                    className="h-20 w-auto object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="flex items-center justify-end w-full gap-2">
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="hidden lg:block p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Collapse sidebar"
                  >
                    <ChevronLeft className="w-5 h-5" strokeWidth={1} />
                  </button>
                  <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
                    <X className="w-5 h-5" strokeWidth={1} />
                  </button>
                </div>
              </div>

              <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {filteredNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-light transition-all duration-200 ${
                        isActive
                          ? 'bg-brand-gold/15 text-brand-navy font-medium'
                          : 'text-gray-600 hover:bg-brand-navy/5'
                      }`}
                    >
                      <div className="w-5 h-5 flex-shrink-0">{item.icon}</div>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-gray-100">
                <div className="mb-4 p-4 backdrop-blur-xl bg-gray-50 rounded-xl">
                  <div className="text-xs font-light text-gray-500 mb-1">Signed in as</div>
                  <div className="text-sm font-light">{profile?.full_name}</div>
                  <div className="text-xs font-light text-gray-500 capitalize">
                    {profile?.role.replace('_', ' ')}
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-3 w-full text-sm font-light text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <LogOut className="w-5 h-5" strokeWidth={1} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      <div className={`transition-all duration-300 ${!isMobile ? (sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64') : ''} ${isTestingMode ? 'pt-10' : ''}`}>
        {isSuperAdmin && (
          <div className={`sticky z-40 bg-white border-b border-gray-100 ${isTestingMode ? 'top-10' : 'top-0'}`}>
            <div className="flex items-center justify-between px-6 py-3">
              <div className="flex items-center gap-6 overflow-x-auto">
                {portals.map((portal) => (
                  <button
                    key={portal.id}
                    onClick={() => {
                      if (portal.id === 'super_admin_portal') {
                        navigate('/users');
                      } else {
                        const firstItem = portalNavItems[portal.id]?.[0];
                        if (firstItem) {
                          navigate(firstItem.path);
                        }
                      }
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-light transition-colors whitespace-nowrap ${
                      selectedPortal === portal.id
                        ? 'bg-black text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-4 h-4">{portal.icon}</div>
                    {portal.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 hover:bg-gray-50 rounded-full transition-colors"
              >
                <Bell className="w-5 h-5" strokeWidth={1} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
            </div>

            {selectedPortal !== 'super_admin_portal' && (
              <div className="border-t border-gray-100 px-6">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {currentNavItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-light transition-colors whitespace-nowrap border-b-2 ${
                          isActive
                            ? 'border-black text-black'
                            : 'border-transparent text-gray-600 hover:text-black'
                        }`}
                      >
                        <div className="w-4 h-4">{item.icon}</div>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {!isSuperAdmin && (
          <header className={`sticky z-40 bg-white border-b-2 border-brand-navy/10 ${isTestingMode ? 'top-10' : 'top-0'}`}>
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-4">
                {!isMobile && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="lg:hidden"
                  >
                    <Menu className="w-6 h-6" strokeWidth={1} />
                  </button>
                )}
                {isMobile && (
                  <div className="flex items-center gap-2">
                    <img
                      src="/oshali-logo.png"
                      alt="Oshali Fuel"
                      className="h-7 w-auto object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>

              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2 hover:bg-gray-50 rounded-full transition-colors"
              >
                <Bell className="w-5 h-5" strokeWidth={1} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
            </div>
          </header>
        )}

        <main className={`${isMobile ? 'pb-20' : ''}`}>{children}</main>

        {isMobile && (
          <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 safe-area-pb">
            <div className="flex justify-around items-center px-4 py-2">
              {filteredNavItems.slice(0, 4).map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
                      isActive ? 'text-black' : 'text-gray-400'
                    }`}
                  >
                    <div className="w-6 h-6">{item.icon}</div>
                    <span className="text-xs font-light">{item.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={handleSignOut}
                className="flex flex-col items-center gap-1 px-4 py-2 text-gray-400 rounded-xl"
              >
                <LogOut className="w-6 h-6" strokeWidth={1} />
                <span className="text-xs font-light">Sign Out</span>
              </button>
            </div>
          </nav>
        )}
      </div>

      {sidebarOpen && !isMobile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-20 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
