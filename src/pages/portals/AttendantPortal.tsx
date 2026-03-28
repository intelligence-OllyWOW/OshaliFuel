import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OshaliLoader from '../../components/OshaliLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { FileText, Plus, Eye, Camera, X, Printer, ChevronDown } from 'lucide-react';
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
        .from('client_vehicles')
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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="px-4 pt-4 pb-3 max-w-xl mx-auto">
          <div className="mb-3">
            <div className="text-2xl font-extrabold text-[#F5A623] tracking-tight">OshaliFuel</div>
            <h1 className="text-xl font-semibold text-[#1B2D5B]">Delivery Notes</h1>
            {profile?.full_name && (
              <p className="text-sm text-gray-400 mt-0.5">{profile.full_name}</p>
            )}
          </div>
          {/* iOS segmented tab control */}
          <div className="bg-gray-100 rounded-2xl p-1 flex">
            <button
              type="button"
              onClick={() => setView('create')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                view === 'create'
                  ? 'bg-white text-[#1B2D5B] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              <Plus className="w-4 h-4" strokeWidth={2} /> Create
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                view === 'list'
                  ? 'bg-white text-[#1B2D5B] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              <Eye className="w-4 h-4" strokeWidth={2} /> View All
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 max-w-xl mx-auto">
        {/* Feedback banner */}
        {feedback && (
          <div className={`mb-4 p-4 rounded-2xl ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}>
            <p className="text-sm font-medium">{feedback.message}</p>
          </div>
        )}

        {view === 'create' ? (
          <div className="relative">
            {creating && <OshaliLoader variant="overlay" message="Creating delivery note..." />}
            <form
              id="delivery-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(new FormData(e.currentTarget));
              }}
              className="space-y-5"
            >
              {/* CUSTOMER section */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer</div>
                {/* Custom customer toggle */}
                <label htmlFor="customCustomer" className="flex items-center gap-3 py-3 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    id="customCustomer"
                    checked={customCustomer}
                    onChange={(e) => {
                      setCustomCustomer(e.target.checked);
                      setSelectedClient('');
                    }}
                    className="w-5 h-5 rounded border-gray-300 accent-[#F5A623]"
                  />
                  <span className="text-sm text-gray-600">Custom customer (not in list)</span>
                </label>
                {/* Customer name or select */}
                {customCustomer ? (
                  <input
                    name="customCustomerName"
                    type="text"
                    placeholder="Customer name"
                    required
                    className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200 bg-white outline-none focus:border-[#1B2D5B] focus:ring-2 focus:ring-[#1B2D5B]/10 placeholder:text-gray-400 text-gray-900 min-h-[56px]"
                  />
                ) : (
                  <div className="relative">
                    <select
                      name="clientId"
                      value={selectedClient}
                      onChange={(e) => setSelectedClient(e.target.value)}
                      required
                      className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200 bg-white outline-none appearance-none focus:border-[#1B2D5B] focus:ring-2 focus:ring-[#1B2D5B]/10 text-gray-900 min-h-[56px]"
                    >
                      <option value="">Select customer...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" strokeWidth={2} />
                  </div>
                )}
              </div>

              {/* VEHICLE & DRIVER section */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Vehicle & Driver</div>
                {!customCustomer && vehicles.length > 0 && (
                  <div className="relative">
                    <select
                      name="vehicleId"
                      className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200 bg-white outline-none appearance-none focus:border-[#1B2D5B] focus:ring-2 focus:ring-[#1B2D5B]/10 text-gray-900 min-h-[56px]"
                    >
                      <option value="">Select vehicle (optional)...</option>
                      {vehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.registration_number} - {vehicle.make || 'N/A'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" strokeWidth={2} />
                  </div>
                )}
                <input
                  name="vehicleRegistration"
                  type="text"
                  placeholder="Registration number"
                  required
                  className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200 bg-white outline-none focus:border-[#1B2D5B] focus:ring-2 focus:ring-[#1B2D5B]/10 placeholder:text-gray-400 text-gray-900 min-h-[56px]"
                />
                <input
                  name="driverName"
                  type="text"
                  placeholder="Driver name"
                  required
                  className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200 bg-white outline-none focus:border-[#1B2D5B] focus:ring-2 focus:ring-[#1B2D5B]/10 placeholder:text-gray-400 text-gray-900 min-h-[56px]"
                />
              </div>

              {/* METER READINGS section */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Meter Readings</div>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-2 divide-x divide-gray-200">
                    <div className="p-5">
                      <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Meter A</div>
                      <input
                        name="meterA"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={meterA}
                        onChange={(e) => setMeterA(e.target.value)}
                        required
                        className="w-full text-3xl font-bold text-[#1B2D5B] bg-transparent outline-none placeholder:text-gray-300"
                      />
                    </div>
                    <div className="p-5">
                      <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Meter B</div>
                      <input
                        name="meterB"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={meterB}
                        onChange={(e) => setMeterB(e.target.value)}
                        required
                        className="w-full text-3xl font-bold text-[#1B2D5B] bg-transparent outline-none placeholder:text-gray-300"
                      />
                    </div>
                  </div>
                  {(meterA || meterB) && (
                    <div className="text-center py-4 border-t border-gray-200">
                      <div className="text-3xl font-bold text-[#1B2D5B]">{calculateLitres().toFixed(2)}</div>
                      <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wider">Litres dispensed</div>
                    </div>
                  )}
                </div>
              </div>

              {/* LITER READING section */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Liter Reading</div>
                <input
                  name="litresReading"
                  type="number"
                  step="0.01"
                  placeholder="Pump meter reading"
                  required
                  className="w-full px-4 py-4 text-base rounded-2xl border border-gray-200 bg-white outline-none focus:border-[#1B2D5B] focus:ring-2 focus:ring-[#1B2D5B]/10 placeholder:text-gray-400 text-gray-900 min-h-[56px]"
                />
                <p className="text-xs text-gray-400 mt-1.5 px-1">Reading from the pump meter</p>
              </div>

              {/* METER PHOTO section */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Meter Photo</div>
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
                      className="w-full h-48 object-cover rounded-2xl"
                    />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute top-3 right-3 bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                    >
                      <X className="w-5 h-5" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCameraClick}
                    className="w-full min-h-[120px] border-2 border-dashed border-gray-300 rounded-2xl hover:border-[#F5A623] transition-colors flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-[#F5A623] bg-white"
                  >
                    <Camera className="w-8 h-8" strokeWidth={1.5} />
                    <span className="text-sm font-medium">Tap to capture meter photo</span>
                  </button>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={creating}
                className="w-full py-4 text-base font-semibold rounded-2xl shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[#F5A623] text-white hover:bg-[#e09610]"
              >
                {creating ? 'Creating...' : 'Create Delivery Note'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            {deliveryNotes.length === 0 ? (
              <div className="text-center py-20">
                <FileText className="w-14 h-14 mx-auto mb-4 text-gray-300" strokeWidth={1} />
                <p className="text-lg font-semibold text-gray-500">No delivery notes yet</p>
                <p className="text-sm text-gray-400 mt-1">Delivery notes you create will appear here</p>
              </div>
            ) : (
              <>
                {(showAll ? deliveryNotes : deliveryNotes.slice(0, 5)).map((note) => (
                  <div key={note.id} className="bg-white rounded-2xl shadow-sm p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{note.note_number}</div>
                        <div className="text-base font-semibold text-[#1B2D5B]">{note.customer_name}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-[#1B2D5B]">{note.litres_dispensed}</div>
                        <div className="text-xs text-gray-400">litres</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 py-3 border-t border-gray-100">
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Registration</div>
                        <div className="text-sm font-semibold text-gray-800">{note.vehicle_registration}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Driver</div>
                        <div className="text-sm font-semibold text-gray-800">{note.driver_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Meter A</div>
                        <div className="text-sm font-semibold text-gray-800">{note.meter_reading_a}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Meter B</div>
                        <div className="text-sm font-semibold text-gray-800">{note.meter_reading_b}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Liter Reading</div>
                        <div className="text-sm font-semibold text-gray-800">{note.litres_reading || 0} L</div>
                      </div>
                    </div>
                    {note.meter_photo_url && (
                      <div className="pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Meter Photo</div>
                        <img
                          src={note.meter_photo_url}
                          alt="Meter reading"
                          className="w-full h-40 object-cover rounded-xl"
                        />
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-700">{note.attendant_name}</div>
                        <div className="text-xs text-gray-400">{format(new Date(note.created_at), 'MMM dd, HH:mm')}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => printDeliveryNote(note)}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full border border-[#F5A623] text-[#F5A623] hover:bg-amber-50 transition-colors"
                      >
                        <Printer className="w-4 h-4" strokeWidth={2} />
                        Print
                      </button>
                    </div>
                  </div>
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
