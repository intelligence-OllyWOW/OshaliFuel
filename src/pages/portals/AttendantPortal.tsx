import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OshaliLoader from '../../components/OshaliLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { FileText, Plus, Eye, Camera, X, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { printDeliveryNote } from '../../lib/printDeliveryNote';
import type { Database } from '../../lib/database.types';

type Client = Database['public']['Tables']['clients']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type DeliveryNote = Database['public']['Tables']['delivery_notes']['Row'];

export default function AttendantPortal() {
  const { profile } = useAuth();
  const [view, setView] = useState<'create' | 'list'>('create');
  const [showAll, setShowAll] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [customCustomer, setCustomCustomer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [meterPhoto, setMeterPhoto] = useState<File | null>(null);
  const [meterPhotoPreview, setMeterPhotoPreview] = useState<string | null>(null);
  const [meterA, setMeterA] = useState<string>('');
  const [meterB, setMeterB] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadClients();
    loadDeliveryNotes();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadVehicles(selectedClient);
    } else {
      setVehicles([]);
    }
  }, [selectedClient]);

  async function loadClients() {
    try {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadVehicles(clientId: string) {
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('client_id', clientId)
        .order('registration_number');

      setVehicles(data || []);
    } catch (error) {
      console.error('Error loading vehicles:', error);
    }
  }

  async function loadDeliveryNotes() {
    try {
      const { data } = await supabase
        .from('delivery_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      setDeliveryNotes(data || []);
    } catch (error) {
      console.error('Error loading delivery notes:', error);
    }
  }

  function handleCameraClick() {
    fileInputRef.current?.click();
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setMeterPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMeterPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function removePhoto() {
    setMeterPhoto(null);
    setMeterPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function calculateLitres() {
    const a = parseFloat(meterA) || 0;
    const b = parseFloat(meterB) || 0;
    return Math.max(0, b - a);
  }

  async function handleSubmit(formData: FormData) {
    if (!profile) return;

    const customerName = customCustomer
      ? (formData.get('customCustomerName') as string)
      : clients.find(c => c.id === selectedClient)?.name || '';

    const vehicleRegistration = formData.get('vehicleRegistration') as string;
    const driverName = formData.get('driverName') as string;
    const meterAValue = parseFloat(meterA || '0');
    const meterBValue = parseFloat(meterB || '0');
    const litresReadingValue = parseFloat(formData.get('litresReading') as string || '0');
    const litres = meterBValue - meterAValue;

    if (!customerName || !vehicleRegistration || !driverName) {
      setFeedback({ type: 'error', message: 'Please fill in all required fields' });
      return;
    }

    if (litres <= 0) {
      setFeedback({ type: 'error', message: 'Meter reading B must be greater than meter reading A' });
      return;
    }

    if (litresReadingValue <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid liter reading' });
      return;
    }

    setCreating(true);
    setFeedback(null);

    try {
      const { data: noteNumberData, error: noteNumberError } = await supabase
        .rpc('generate_delivery_note_number');

      if (noteNumberError) throw noteNumberError;

      const noteNumber = noteNumberData as string;
      let meterPhotoUrl = null;

      if (meterPhoto) {
        const fileExt = meterPhoto.name.split('.').pop();
        const fileName = `${noteNumber}-meter.${fileExt}`;
        const filePath = `delivery-notes/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, meterPhoto, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documents')
          .getPublicUrl(filePath);

        meterPhotoUrl = publicUrl;
      }

      const { error } = await supabase
        .from('delivery_notes')
        .insert({
          note_number: noteNumber,
          client_id: customCustomer ? null : (selectedClient || null),
          customer_name: customerName,
          vehicle_registration: vehicleRegistration,
          driver_name: driverName,
          meter_reading_a: meterAValue,
          meter_reading_b: meterBValue,
          litres_dispensed: litres,
          litres_reading: litresReadingValue,
          attendant_id: profile.id,
          attendant_name: profile.full_name,
          meter_photo_url: meterPhotoUrl,
        });

      if (error) throw error;

      setFeedback({ type: 'success', message: 'Delivery note created successfully!' });
      (document.getElementById('delivery-form') as HTMLFormElement)?.reset();
      setSelectedClient('');
      setCustomCustomer(false);
      setMeterPhoto(null);
      setMeterPhotoPreview(null);
      setMeterA('');
      setMeterB('');
      loadDeliveryNotes();

      setTimeout(() => setFeedback(null), 3000);
    } catch (error: any) {
      setFeedback({ type: 'error', message: error.message || 'Failed to create delivery note' });
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <OshaliLoader variant="fullscreen" />;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="p-4">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">Delivery Notes</h1>
          <div className="flex gap-3">
            <Button
              variant={view === 'create' ? 'primary' : 'secondary'}
              onClick={() => setView('create')}
              className="flex-1 py-3"
            >
              <Plus className="w-5 h-5 mr-2" strokeWidth={2} />
              Create
            </Button>
            <Button
              variant={view === 'list' ? 'primary' : 'secondary'}
              onClick={() => setView('list')}
              className="flex-1 py-3"
            >
              <Eye className="w-5 h-5 mr-2" strokeWidth={2} />
              View All
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        {feedback && (
          <div className={`mb-4 p-4 rounded-xl border ${
            feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <p className="font-medium">{feedback.message}</p>
          </div>
        )}

        {view === 'create' ? (
          <Card className="relative">
            {creating && <OshaliLoader variant="overlay" message="Creating delivery note..." />}
            <form
              id="delivery-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(new FormData(e.currentTarget));
              }}
              className="space-y-5"
            >
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <input
                  type="checkbox"
                  id="customCustomer"
                  checked={customCustomer}
                  onChange={(e) => {
                    setCustomCustomer(e.target.checked);
                    setSelectedClient('');
                  }}
                  className="w-5 h-5 rounded border-gray-400"
                />
                <label htmlFor="customCustomer" className="font-medium text-gray-800 text-base">
                  Custom Customer (not in list)
                </label>
              </div>

              {customCustomer ? (
                <Input
                  name="customCustomerName"
                  label="Customer Name"
                  placeholder="Enter customer name"
                  required
                  className="text-base"
                />
              ) : (
                <Select
                  name="clientId"
                  label="Customer"
                  value={selectedClient}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  required
                  className="text-base"
                >
                  <option value="">Select customer...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              )}

              {!customCustomer && vehicles.length > 0 && (
                <Select name="vehicleId" label="Vehicle (Optional)" className="text-base">
                  <option value="">Select vehicle or enter manually...</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registration_number} - {vehicle.make || 'N/A'}
                    </option>
                  ))}
                </Select>
              )}

              <Input
                name="vehicleRegistration"
                label="Registration No."
                placeholder="Enter vehicle reg no."
                required
                className="text-base"
              />

              <Input
                name="driverName"
                label="Driver Name"
                placeholder="Enter driver name"
                required
                className="text-base"
              />

              <div className="border-t border-gray-200 pt-5 mt-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Meter Readings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    name="meterA"
                    label="Meter A"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={meterA}
                    onChange={(e) => setMeterA(e.target.value)}
                    required
                    className="text-base"
                  />
                  <Input
                    name="meterB"
                    label="Meter B"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={meterB}
                    onChange={(e) => setMeterB(e.target.value)}
                    required
                    className="text-base"
                  />
                </div>

                {(meterA || meterB) && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-300 rounded-lg">
                    <div className="text-sm font-medium text-blue-700">Calculated Litres (Meter B - Meter A):</div>
                    <div className="text-3xl font-bold text-blue-900">{calculateLitres().toFixed(2)} L</div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-5 mt-5">
                <Input
                  name="litresReading"
                  label="Liter Reading"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  className="text-base"
                />
                <p className="text-sm font-medium text-gray-600 mt-1">Enter the liter reading from the pump meter</p>
              </div>

              <div className="border-t border-gray-200 pt-5 mt-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Meter Photo</h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />

                {meterPhotoPreview ? (
                  <div className="relative">
                    <img
                      src={meterPhotoPreview}
                      alt="Meter reading"
                      className="w-full h-48 object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-5 h-5" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    className="w-full py-5 border-2 border-dashed border-gray-400 rounded-lg hover:border-gray-600 transition-colors flex flex-col items-center justify-center gap-2 text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-gray-100"
                  >
                    <Camera className="w-8 h-8" strokeWidth={2} />
                    <span className="font-semibold text-base">Take Photo of Meter</span>
                  </button>
                )}
              </div>

              <div className="bg-gray-100 rounded-lg p-4 border border-gray-300">
                <div className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-0.5">Attendant</div>
                <div className="font-semibold text-gray-900 text-lg">{profile?.full_name}</div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-4 text-base rounded-xl font-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[#F5A623] text-white hover:bg-[#e09610]"
              >
                {creating ? 'Creating...' : 'Create Delivery Note'}
              </button>
            </form>
          </Card>
        ) : (
          <div className="space-y-4">
            {deliveryNotes.length === 0 ? (
              <Card>
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-40" strokeWidth={1.5} />
                  <p className="text-lg font-medium">No delivery notes yet</p>
                </div>
              </Card>
            ) : (
              <>
              {(showAll ? deliveryNotes : deliveryNotes.slice(0, 5)).map((note) => (
                <Card key={note.id}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-xs text-gray-500 mb-1 uppercase tracking-wide">{note.note_number}</div>
                        <div className="font-semibold text-gray-900 text-xl">{note.customer_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Litres</div>
                        <div className="font-bold text-2xl text-blue-700">{note.litres_dispensed} L</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Registration</div>
                        <div className="font-semibold text-gray-900">{note.vehicle_registration}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Driver</div>
                        <div className="font-semibold text-gray-900">{note.driver_name}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meter A</div>
                        <div className="font-semibold text-gray-800">{note.meter_reading_a}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meter B</div>
                        <div className="font-semibold text-gray-800">{note.meter_reading_b}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Liter Reading</div>
                        <div className="font-semibold text-gray-800">{note.litres_reading || 0} L</div>
                      </div>
                    </div>
                    {note.meter_photo_url && (
                      <div className="pt-3 border-t border-gray-200">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Meter Photo</div>
                        <img
                          src={note.meter_photo_url}
                          alt="Meter reading"
                          className="w-full h-40 object-cover rounded-lg border border-gray-200"
                        />
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700">{note.attendant_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-500">{format(new Date(note.created_at), 'MMM dd, HH:mm')}</span>
                        <button
                          type="button"
                          onClick={() => printDeliveryNote(note)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 hover:text-gray-900 transition-colors"
                        >
                          <Printer className="w-4 h-4" strokeWidth={2} />
                          Print
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {!showAll && deliveryNotes.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="w-full py-3 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Show all {deliveryNotes.length} notes
                </button>
              )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
