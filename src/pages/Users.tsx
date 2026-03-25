import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format, subDays } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import type { Database } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface ClientRevenue {
  name: string;
  revenue: number;
  invoiceCount: number;
}

export default function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [topClients, setTopClients] = useState<ClientRevenue[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    loadUsers();
    loadTopClients();
  }, []);

  async function loadUsers() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTopClients() {
    try {
      const thirtyDaysAgo = subDays(new Date(), 30);

      const { data: invoices } = await supabase
        .from('invoices')
        .select(`
          id,
          total_amount,
          client_id,
          client:client_id (name)
        `)
        .neq('status', 'void')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      const clientRevenue: Record<string, ClientRevenue> = {};

      invoices?.forEach((invoice: any) => {
        const clientName = invoice.client?.name || 'Walk-in';
        if (!clientRevenue[clientName]) {
          clientRevenue[clientName] = { name: clientName, revenue: 0, invoiceCount: 0 };
        }
        clientRevenue[clientName].revenue += invoice.total_amount;
        clientRevenue[clientName].invoiceCount += 1;
      });

      const sortedClients = Object.values(clientRevenue)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      setTopClients(sortedClients);
    } catch (error) {
      console.error('Error loading top clients:', error);
    } finally {
      setClientsLoading(false);
    }
  }

  async function handleCreateUser(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;
    const role = formData.get('role') as string;

    setCreating(true);
    setFeedback(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setFeedback({ type: 'error', message: 'You must be logged in to create users' });
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setFeedback({ type: 'error', message: result.error || 'Failed to create user' });
        return;
      }

      setFeedback({ type: 'success', message: `User ${fullName} created successfully!` });
      setShowModal(false);
      loadUsers();

      setTimeout(() => setFeedback(null), 5000);
    } catch (error: any) {
      setFeedback({ type: 'error', message: error.message || 'Failed to create user' });
    } finally {
      setCreating(false);
    }
  }

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    general_manager: 'General Manager',
    finance: 'Finance',
    administrator: 'Administrator',
    operations_supervisor: 'Operations Supervisor',
    pump_attendant: 'Pump Attendant',
    attendant: 'Attendant',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light">Super Admin Dashboard</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
          Add User
        </Button>
      </div>

      {feedback && (
        <div className={`mb-4 p-4 rounded-xl border ${
          feedback.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <p className="text-sm font-light">{feedback.message}</p>
        </div>
      )}

      <div className="mb-6">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-lg font-light">Top Clients by Revenue</h2>
              <p className="text-sm font-light text-gray-500">Last 30 days</p>
            </div>
          </div>

          {clientsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
            </div>
          ) : topClients.length === 0 ? (
            <div className="text-center py-8 text-sm font-light text-gray-400">
              No client data available
            </div>
          ) : (
            <div className="space-y-3">
              {topClients.map((client, index) => {
                const maxRevenue = topClients[0]?.revenue || 1;
                const percentage = (client.revenue / maxRevenue) * 100;
                return (
                  <div key={client.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-sm font-light text-white">
                          {index + 1}
                        </div>
                        <span className="font-light">{client.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-light">{formatCurrency(client.revenue)}</div>
                        <div className="text-xs font-light text-gray-400">{client.invoiceCount} invoices</div>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden ml-11">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <h2 className="text-xl font-light mb-4">User Management</h2>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-light">{user.full_name}</span>
                    <span className="text-xs font-light px-2 py-1 bg-gray-100 text-gray-700 rounded-full capitalize">
                      {roleLabels[user.role] || user.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-sm font-light text-gray-500">
                    <div>{user.email}</div>
                    <div>Joined {format(new Date(user.created_at), 'MMM dd, yyyy')}</div>
                  </div>
                </div>
                {user.id !== profile?.id && (
                  <Button size="sm" variant="ghost">
                    <Trash2 className="w-4 h-4 text-red-500" strokeWidth={1} />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add New User">
        <form onSubmit={(e) => { e.preventDefault(); handleCreateUser(new FormData(e.currentTarget)); }}>
          <div className="space-y-4">
            <Input name="fullName" label="Full Name" required />
            <Input name="email" label="Email" type="email" required />
            <Input name="password" label="Password" type="password" required minLength={6} />
            <Select name="role" label="Role" required>
              <option value="">Select role...</option>
              <option value="super_admin">Super Admin</option>
              <option value="general_manager">General Manager</option>
              <option value="finance">Finance</option>
              <option value="administrator">Administrator</option>
              <option value="operations_supervisor">Operations Supervisor</option>
              <option value="pump_attendant">Pump Attendant</option>
              <option value="attendant">Attendant</option>
            </Select>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={creating}>
                {creating ? 'Creating...' : 'Create User'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)} disabled={creating}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
