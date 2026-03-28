import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { Plus, Edit2, Trash2, Car, User, Phone, Mail, MapPin, DollarSign, ArrowLeft, FileText, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface Client {
  id: string;
  name: string;
  cell_number: string | null;
  po_box: string | null;
  email: string | null;
  custom_price_per_liter: number | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  client_id: string;
  registration_number: string;
  vehicle_type: string | null;
  make: string | null;
  model: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  delivery_note_number: string;
  client_id: string | null;
  vehicle_id: string | null;
  liters_sold: number;
  selling_price_per_liter: number;
  total_amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  settled_at: string | null;
}

export default function Clients() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle[]>>({});
  const [loading, setLoading] = useState(true);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>([]);

  const [clientForm, setClientForm] = useState({
    name: '',
    cell_number: '',
    po_box: '',
    email: '',
    custom_price_per_liter: '',
  });

  const [vehicleForm, setVehicleForm] = useState({
    registration_number: '',
    vehicle_type: '',
    make: '',
    model: '',
  });

  const canEdit = profile?.role === 'super_admin' || profile?.role === 'general_manager';

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      const { data: clientsData } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (clientsData) {
        setClients(clientsData);

        const { data: vehiclesData } = await supabase
          .from('client_vehicles')
          .select('*')
          .in('client_id', clientsData.map(c => c.id));

        if (vehiclesData) {
          const vehiclesByClient: Record<string, Vehicle[]> = {};
          vehiclesData.forEach(v => {
            if (!vehiclesByClient[v.client_id]) {
              vehiclesByClient[v.client_id] = [];
            }
            vehiclesByClient[v.client_id].push(v);
          });
          setVehicles(vehiclesByClient);
        }
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadClientInvoices(clientId: string) {
    try {
      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (data) {
        setClientInvoices(data);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    }
  }

  function viewClientDetails(clientId: string) {
    setViewingClientId(clientId);
    loadClientInvoices(clientId);
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'paid':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'overdue':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  }

  function openClientModal(client?: Client) {
    if (client) {
      setEditingClient(client);
      setClientForm({
        name: client.name,
        cell_number: client.cell_number || '',
        po_box: client.po_box || '',
        email: client.email || '',
        custom_price_per_liter: client.custom_price_per_liter?.toString() || '',
      });
    } else {
      setEditingClient(null);
      setClientForm({
        name: '',
        cell_number: '',
        po_box: '',
        email: '',
        custom_price_per_liter: '',
      });
    }
    setShowClientModal(true);
  }

  function openVehicleModal(clientId: string, vehicle?: Vehicle) {
    setSelectedClientId(clientId);
    if (vehicle) {
      setEditingVehicle(vehicle);
      setVehicleForm({
        registration_number: vehicle.registration_number,
        vehicle_type: vehicle.vehicle_type || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
      });
    } else {
      setEditingVehicle(null);
      setVehicleForm({
        registration_number: '',
        vehicle_type: '',
        make: '',
        model: '',
      });
    }
    setShowVehicleModal(true);
  }

  async function handleSaveClient() {
    if (!clientForm.name.trim()) return;

    try {
      const clientData = {
        name: clientForm.name.trim(),
        cell_number: clientForm.cell_number.trim() || null,
        po_box: clientForm.po_box.trim() || null,
        email: clientForm.email.trim() || null,
        custom_price_per_liter: clientForm.custom_price_per_liter
          ? parseFloat(clientForm.custom_price_per_liter)
          : null,
      };

      if (editingClient) {
        await supabase
          .from('clients')
          .update({ ...clientData, updated_at: new Date().toISOString() })
          .eq('id', editingClient.id);
      } else {
        await supabase
          .from('clients')
          .insert({ ...clientData, is_test_data: isTestingMode });
      }

      setShowClientModal(false);
      loadClients();
    } catch (error) {
      console.error('Error saving client:', error);
    }
  }

  async function handleDeleteClient(id: string) {
    if (!confirm('Are you sure you want to delete this client? This will also delete all their vehicles.')) return;

    try {
      await supabase.from('clients').delete().eq('id', id);
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
    }
  }

  async function handleSaveVehicle() {
    if (!vehicleForm.registration_number.trim() || !vehicleForm.vehicle_type || !selectedClientId) return;

    try {
      const vehicleData = {
        client_id: selectedClientId,
        registration_number: vehicleForm.registration_number.trim().toUpperCase(),
        vehicle_type: vehicleForm.vehicle_type,
        make: vehicleForm.make.trim() || null,
        model: vehicleForm.model.trim() || null,
      };

      if (editingVehicle) {
        await supabase
          .from('client_vehicles')
          .update(vehicleData)
          .eq('id', editingVehicle.id);
      } else {
        await supabase.from('client_vehicles').insert({ ...vehicleData, is_test_data: isTestingMode });
      }

      setShowVehicleModal(false);
      loadClients();
    } catch (error) {
      console.error('Error saving vehicle:', error);
    }
  }

  async function handleDeleteVehicle(id: string) {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;

    try {
      await supabase.from('client_vehicles').delete().eq('id', id);
      loadClients();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
    }
  }

  if (loading) {
    return <OshaliLoader variant="fullscreen" />;
  }

  const viewingClient = viewingClientId ? clients.find(c => c.id === viewingClientId) : null;

  if (viewingClient) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => {
              setViewingClientId(null);
              setClientInvoices([]);
            }}
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            Back to Clients
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-600" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-light">{viewingClient.name}</h2>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-100">
                  {viewingClient.cell_number && (
                    <div className="flex items-center gap-2 text-sm font-light text-gray-600">
                      <Phone className="w-4 h-4" strokeWidth={1.5} />
                      {viewingClient.cell_number}
                    </div>
                  )}
                  {viewingClient.email && (
                    <div className="flex items-center gap-2 text-sm font-light text-gray-600">
                      <Mail className="w-4 h-4" strokeWidth={1.5} />
                      {viewingClient.email}
                    </div>
                  )}
                  {viewingClient.po_box && (
                    <div className="flex items-center gap-2 text-sm font-light text-gray-600">
                      <MapPin className="w-4 h-4" strokeWidth={1.5} />
                      {viewingClient.po_box}
                    </div>
                  )}
                  {viewingClient.custom_price_per_liter && (
                    <div className="flex items-center gap-2 text-sm font-light text-gray-600">
                      <DollarSign className="w-4 h-4" strokeWidth={1.5} />
                      Custom Price: {formatCurrency(viewingClient.custom_price_per_liter)}/L
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Car className="w-4 h-4" strokeWidth={1.5} />
                    Vehicles ({vehicles[viewingClient.id]?.length || 0})
                  </h3>
                  {vehicles[viewingClient.id] && vehicles[viewingClient.id].length > 0 ? (
                    <div className="space-y-2">
                      {vehicles[viewingClient.id].map((vehicle) => (
                        <div key={vehicle.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="font-medium text-sm">{vehicle.registration_number}</div>
                          <div className="text-xs font-light text-gray-500 mt-1">
                            {vehicle.vehicle_type && (
                              <span className="capitalize">{vehicle.vehicle_type}</span>
                            )}
                            {(vehicle.make || vehicle.model) && vehicle.vehicle_type && ' • '}
                            {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-light text-gray-400">No vehicles registered</p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <div className="mb-4">
                <h2 className="text-lg font-light flex items-center gap-2">
                  <FileText className="w-5 h-5" strokeWidth={1.5} />
                  Invoices
                </h2>
              </div>

              {clientInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" strokeWidth={1} />
                  <p className="text-gray-500 font-light">No invoices found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clientInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-sm">{invoice.invoice_number}</span>
                            <span className={`px-2 py-1 rounded-full text-xs border flex items-center gap-1 ${getStatusColor(invoice.status)}`}>
                              {getStatusIcon(invoice.status)}
                              <span className="capitalize">{invoice.status}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-light text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" strokeWidth={1.5} />
                              {new Date(invoice.created_at).toLocaleDateString()}
                            </span>
                            <span>{invoice.liters_sold} L</span>
                            {invoice.payment_method && (
                              <span className="capitalize">{invoice.payment_method}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(invoice.total_amount)}</div>
                          <div className="text-xs font-light text-gray-500">
                            {formatCurrency(invoice.selling_price_per_liter)}/L
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light mb-2">Clients</h1>
          <p className="text-sm font-light text-gray-500">
            Manage clients, their vehicles, and custom pricing
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => openClientModal()}>
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Add Client
          </Button>
        )}
      </div>

      {clients.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" strokeWidth={1} />
            <p className="text-gray-500 font-light">No clients yet</p>
            {canEdit && (
              <Button className="mt-4" onClick={() => openClientModal()}>
                Add First Client
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {clients.map((client) => (
            <Card key={client.id} className="cursor-pointer" onClick={() => viewClientDetails(client.id)}>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                      </div>
                      <div>
                        <h3 className="text-lg font-light">{client.name}</h3>
                        <div className="flex flex-wrap gap-4 mt-1 text-sm font-light text-gray-500">
                          {client.cell_number && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" strokeWidth={1.5} />
                              {client.cell_number}
                            </span>
                          )}
                          {client.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" strokeWidth={1.5} />
                              {client.email}
                            </span>
                          )}
                          {client.po_box && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" strokeWidth={1.5} />
                              {client.po_box}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {client.custom_price_per_liter && (
                      <div className="text-right">
                        <div className="text-xs font-light text-gray-500">Custom Price</div>
                        <div className="flex items-center gap-1 text-green-600 font-light">
                          <DollarSign className="w-3 h-3" strokeWidth={1.5} />
                          {formatCurrency(client.custom_price_per_liter)}/L
                        </div>
                      </div>
                    )}
                    {canEdit && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openClientModal(client);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClient(client.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedClient(expandedClient === client.id ? null : client.id);
                      }}
                      className="flex items-center gap-2 text-sm font-light text-gray-600 hover:text-gray-900"
                    >
                      <Car className="w-4 h-4" strokeWidth={1.5} />
                      Vehicles ({vehicles[client.id]?.length || 0})
                    </button>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openVehicleModal(client.id);
                        }}
                      >
                        <Plus className="w-3 h-3" strokeWidth={1.5} />
                        Add Vehicle
                      </Button>
                    )}
                  </div>

                  {expandedClient === client.id && vehicles[client.id]?.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                      {vehicles[client.id].map((vehicle) => (
                        <div
                          key={vehicle.id}
                          className="bg-gray-50 rounded-xl p-3 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-sm">{vehicle.registration_number}</div>
                            <div className="text-xs font-light text-gray-500">
                              {vehicle.vehicle_type && (
                                <span className="capitalize">{vehicle.vehicle_type}</span>
                              )}
                              {(vehicle.make || vehicle.model) && vehicle.vehicle_type && ' • '}
                              {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openVehicleModal(client.id, vehicle);
                                }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                <Edit2 className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteVehicle(vehicle.id);
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {expandedClient === client.id && (!vehicles[client.id] || vehicles[client.id].length === 0) && (
                    <div className="text-sm font-light text-gray-400 text-center py-4">
                      No vehicles registered
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        title={editingClient ? 'Edit Client' : 'Add New Client'}
      >
        <div className="space-y-4">
          <Input
            label="Client Name *"
            value={clientForm.name}
            onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
            placeholder="Enter client name"
          />
          <Input
            label="Cell Number"
            value={clientForm.cell_number}
            onChange={(e) => setClientForm({ ...clientForm, cell_number: e.target.value })}
            placeholder="e.g., +264 81 234 5678"
          />
          <Input
            label="P.O. Box"
            value={clientForm.po_box}
            onChange={(e) => setClientForm({ ...clientForm, po_box: e.target.value })}
            placeholder="e.g., P.O. Box 1234, Windhoek"
          />
          <Input
            label="Email"
            type="email"
            value={clientForm.email}
            onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
            placeholder="email@example.com"
          />
          <Input
            label="Custom Price per Liter"
            type="number"
            step="0.01"
            value={clientForm.custom_price_per_liter}
            onChange={(e) => setClientForm({ ...clientForm, custom_price_per_liter: e.target.value })}
            placeholder="Leave empty to use default price"
          />

          <div className="flex gap-2 pt-4">
            <Button onClick={handleSaveClient} className="flex-1" disabled={!clientForm.name.trim()}>
              {editingClient ? 'Update Client' : 'Add Client'}
            </Button>
            <Button variant="secondary" onClick={() => setShowClientModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showVehicleModal}
        onClose={() => setShowVehicleModal(false)}
        title={editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
      >
        <div className="space-y-4">
          <Input
            label="Registration Number *"
            value={vehicleForm.registration_number}
            onChange={(e) => setVehicleForm({ ...vehicleForm, registration_number: e.target.value })}
            placeholder="e.g., N 12345 W"
          />
          <Select
            label="Vehicle Type *"
            value={vehicleForm.vehicle_type}
            onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
          >
            <option value="">Select vehicle type</option>
            <option value="bus">Bus</option>
            <option value="truck">Truck</option>
            <option value="suv">SUV</option>
            <option value="pickup">Pick up</option>
            <option value="other">Other</option>
          </Select>
          <Input
            label="Make"
            value={vehicleForm.make}
            onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
            placeholder="e.g., Toyota"
          />
          <Input
            label="Model"
            value={vehicleForm.model}
            onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
            placeholder="e.g., Hilux"
          />

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSaveVehicle}
              className="flex-1"
              disabled={!vehicleForm.registration_number.trim() || !vehicleForm.vehicle_type}
            >
              {editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
            </Button>
            <Button variant="secondary" onClick={() => setShowVehicleModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
