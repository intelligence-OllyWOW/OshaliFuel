import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Plus, Eye, Download, CheckCircle, XCircle, Clock, CreditCard, Banknote, Building2, Search, BarChart3, FileText, Truck, Bell, Printer } from 'lucide-react';
import SalesStatistics from '../components/SalesStatistics';
import { supabase } from '../lib/supabase';
import { formatCurrency, generateInvoiceNumber } from '../lib/utils';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import { printDeliveryNote } from '../lib/printDeliveryNote';
import { printInvoice, DEFAULT_PRINT_CONFIG, PrintConfig } from '../lib/printInvoice';

async function fetchAllInvoicesWithPagination(): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let allInvoices: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        client:client_id (*),
        client_vehicle:vehicle_id (*)
      `)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allInvoices = allInvoices.concat(data);
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allInvoices;
}

interface Client {
  id: string;
  name: string;
  cell_number: string | null;
  po_box: string | null;
  email: string | null;
  custom_price_per_liter: number | null;
}

interface ClientVehicle {
  id: string;
  client_id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
}

interface Tank {
  id: string;
  tank_name: string;
  capacity_liters: number;
  current_liters: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  delivery_note_number: string;
  client_id: string | null;
  vehicle_id: string | null;
  liters_sold: number;
  tank_id: string;
  selling_price_per_liter: number;
  total_amount: number;
  status: string;
  payment_method: string | null;
  item_description: string | null;
  created_at: string;
  settled_at: string | null;
  client?: Client | null;
  client_vehicle?: ClientVehicle | null;
}

interface DeliveryNote {
  id: string;
  note_number: string;
  client_id: string | null;
  customer_name: string;
  vehicle_registration: string;
  driver_name: string;
  meter_reading_a: number;
  meter_reading_b: number;
  litres_dispensed: number;
  litres_reading: number;
  attendant_id: string;
  attendant_name: string;
  meter_photo_url: string | null;
  has_invoice: boolean;
  created_at: string;
}

export default function Sales() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientVehicles, setClientVehicles] = useState<ClientVehicle[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<DeliveryNote | null>(null);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceLineItems, setInvoiceLineItems] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [effectivePrice, setEffectivePrice] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const [statusForm, setStatusForm] = useState({
    status: 'unsettled',
    payment_method: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'invoices' | 'statistics' | 'delivery_notes'>('invoices');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      const client = clients.find(c => c.id === selectedClient);
      if (client?.custom_price_per_liter) {
        setEffectivePrice(client.custom_price_per_liter);
      } else {
        setEffectivePrice(currentPrice);
      }
    } else {
      setEffectivePrice(currentPrice);
    }
  }, [selectedClient, clients, currentPrice]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  async function loadData() {
    try {
      const [allInvoices, deliveryNotesResult, clientsResult, vehiclesResult, tanksResult, priceResult] = await Promise.all([
        fetchAllInvoicesWithPagination(),
        supabase
          .from('delivery_notes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('name'),
        supabase.from('client_vehicles').select('*'),
        supabase.from('inventory_tanks').select('*').order('tank_name'),
        supabase
          .from('pricing_settings')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const tanksData = tanksResult.data || [];
      const tanksWithCalculatedLiters = await Promise.all(
        tanksData.map(async (tank) => {
          const { data: items } = await supabase
            .from('inventory_items')
            .select('remaining_liters')
            .eq('tank_id', tank.id)
            .gt('remaining_liters', 0);

          const calculatedLiters = (items || []).reduce(
            (sum, item) => sum + item.remaining_liters,
            0
          );

          return {
            ...tank,
            current_liters: calculatedLiters,
          };
        })
      );

      setInvoices(allInvoices as Invoice[]);
      setDeliveryNotes(deliveryNotesResult.data || []);
      setClients(clientsResult.data || []);
      setClientVehicles(vehiclesResult.data || []);
      setTanks(tanksWithCalculatedLiters);
      const price = priceResult.data?.price_per_liter || 0;
      setCurrentPrice(price);
      setEffectivePrice(price);

      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('*')
        .maybeSingle();
      if (settingsData) setPrintConfig(settingsData as PrintConfig);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewInvoice(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setShowViewModal(true);

    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select(`
        *,
        inventory_item_id (
          *,
          gr_id (
            gr_number
          )
        )
      `)
      .eq('invoice_id', invoice.id)
      .order('created_at');

    setInvoiceLineItems(lineItems || []);
  }

  function openStatusModal(invoice: Invoice) {
    setSelectedInvoice(invoice);
    setStatusForm({
      status: invoice.status || 'unsettled',
      payment_method: invoice.payment_method || '',
    });
    setShowStatusModal(true);
  }

  async function handleUpdateStatus() {
    if (!selectedInvoice || !profile) return;

    if (statusForm.status === 'settled' && !statusForm.payment_method) {
      alert('Please select a payment method');
      return;
    }

    try {
      if (statusForm.status === 'void' && selectedInvoice.status !== 'void') {
        const { data: lineItems } = await supabase
          .from('invoice_line_items')
          .select('inventory_item_id, liters_from_item')
          .eq('invoice_id', selectedInvoice.id);

        if (lineItems && lineItems.length > 0) {
          for (const lineItem of lineItems) {
            const { data: inventoryItem } = await supabase
              .from('inventory_items')
              .select('remaining_liters')
              .eq('id', lineItem.inventory_item_id)
              .maybeSingle();

            if (inventoryItem) {
              const restoredLiters = inventoryItem.remaining_liters + lineItem.liters_from_item;
              await supabase
                .from('inventory_items')
                .update({ remaining_liters: restoredLiters })
                .eq('id', lineItem.inventory_item_id);
            }
          }

          const { data: updatedItems } = await supabase
            .from('inventory_items')
            .select('remaining_liters')
            .eq('tank_id', selectedInvoice.tank_id)
            .gt('remaining_liters', 0);

          const newTankLiters = (updatedItems || []).reduce(
            (sum, item) => sum + item.remaining_liters,
            0
          );

          await supabase
            .from('inventory_tanks')
            .update({ current_liters: newTankLiters })
            .eq('id', selectedInvoice.tank_id);
        }
      }

      const updateData: any = {
        status: statusForm.status,
        payment_method: statusForm.status === 'settled' ? statusForm.payment_method : null,
      };

      if (statusForm.status === 'settled') {
        updateData.settled_at = new Date().toISOString();
        updateData.settled_by = profile.id;
      }

      await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', selectedInvoice.id);

      setShowStatusModal(false);
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function handleCreateInvoiceFromDeliveryNote(deliveryNote: DeliveryNote, tankId: string) {
    if (!profile || submitting) return;

    setSubmitting(true);
    try {
      const litersSold = deliveryNote.litres_reading || deliveryNote.litres_dispensed;
      const clientId = deliveryNote.client_id;

      const { data: inventoryItems } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tank_id', tankId)
        .gt('remaining_liters', 0)
        .order('entry_date');

      if (!inventoryItems || inventoryItems.length === 0) {
        alert('No inventory available in selected tank');
        return;
      }

      const totalAvailable = inventoryItems.reduce((sum, item) => sum + item.remaining_liters, 0);
      if (totalAvailable < litersSold) {
        alert(`Insufficient fuel. Only ${totalAvailable.toLocaleString()}L available`);
        return;
      }

      let invoiceData = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        const invoice = {
          invoice_number: generateInvoiceNumber(),
          delivery_note_number: deliveryNote.note_number,
          client_id: clientId,
          vehicle_id: null,
          liters_sold: litersSold,
          tank_id: tankId,
          selling_price_per_liter: effectivePrice,
          item_description: 'Diesel Fuel',
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: new Date().toISOString().split('T')[0],
          status: 'unsettled',
          created_by: profile.id,
          is_test_data: isTestingMode,
        };

        const result = await supabase
          .from('invoices')
          .insert([invoice])
          .select()
          .single();

        if (!result.error) {
          invoiceData = result.data;
          break;
        }

        if (result.error.code === '23505') {
          attempts++;
          continue;
        }

        alert('Error creating invoice');
        return;
      }

      if (!invoiceData) {
        alert('Unable to generate unique invoice number. Please try again.');
        return;
      }

      let remainingToSell = litersSold;
      const lineItems = [];

      for (const item of inventoryItems) {
        if (remainingToSell <= 0) break;

        const litersFromThisItem = Math.min(item.remaining_liters, remainingToSell);

        lineItems.push({
          invoice_id: invoiceData.id,
          inventory_item_id: item.id,
          liters_from_item: litersFromThisItem,
          cost_per_liter: item.cost_per_liter,
          selling_price_per_liter: effectivePrice,
          is_test_data: isTestingMode,
        });

        const newRemaining = item.remaining_liters - litersFromThisItem;

        await supabase
          .from('inventory_items')
          .update({ remaining_liters: newRemaining })
          .eq('id', item.id);

        remainingToSell -= litersFromThisItem;
      }

      await supabase.from('invoice_line_items').insert(lineItems);

      const { data: updatedItems } = await supabase
        .from('inventory_items')
        .select('remaining_liters')
        .eq('tank_id', tankId)
        .gt('remaining_liters', 0);

      const newTankLiters = (updatedItems || []).reduce(
        (sum, item) => sum + item.remaining_liters,
        0
      );

      await supabase
        .from('inventory_tanks')
        .update({ current_liters: newTankLiters })
        .eq('id', tankId);

      await supabase
        .from('delivery_notes')
        .update({ has_invoice: true, invoice_id: invoiceData.id })
        .eq('id', deliveryNote.id);

      setSelectedDeliveryNote(null);
      setShowInvoiceModal(false);
      loadData();
      setActiveTab('invoices');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateInvoice(formData: FormData) {
    if (!profile || submitting) return;

    setSubmitting(true);
    try {
      const litersSold = parseFloat(formData.get('liters') as string);
      const tankId = formData.get('tank') as string;
      const deliveryNote = formData.get('deliveryNote') as string;
      const itemDescription = formData.get('itemDescription') as string || 'Diesel Fuel';
      const invoiceDate = formData.get('invoiceDate') as string;
      const dueDate = formData.get('dueDate') as string;

      const { data: existingDeliveryNote } = await supabase
        .from('invoices')
        .select('id')
        .eq('delivery_note_number', deliveryNote)
        .maybeSingle();

      if (existingDeliveryNote) {
        alert('This delivery note number already exists. Please use a unique delivery note number.');
        return;
      }

      const { data: inventoryItems } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tank_id', tankId)
        .gt('remaining_liters', 0)
        .order('entry_date');

      if (!inventoryItems || inventoryItems.length === 0) {
        alert('No inventory available in selected tank');
        return;
      }

      const totalAvailable = inventoryItems.reduce((sum, item) => sum + item.remaining_liters, 0);
      if (totalAvailable < litersSold) {
        alert(`Insufficient fuel. Only ${totalAvailable.toLocaleString()}L available`);
        return;
      }

      let invoiceData = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        const invoice = {
          invoice_number: generateInvoiceNumber(),
          delivery_note_number: deliveryNote,
          client_id: selectedClient || null,
          vehicle_id: selectedVehicle || null,
          liters_sold: litersSold,
          tank_id: tankId,
          selling_price_per_liter: effectivePrice,
          item_description: itemDescription,
          invoice_date: invoiceDate,
          due_date: dueDate,
          status: 'unsettled',
          created_by: profile.id,
          is_test_data: isTestingMode,
        };

        const result = await supabase
          .from('invoices')
          .insert([invoice])
          .select()
          .single();

        if (!result.error) {
          invoiceData = result.data;
          break;
        }

        if (result.error.code === '23505') {
          attempts++;
          continue;
        }

        alert('Error creating invoice');
        return;
      }

      if (!invoiceData) {
        alert('Unable to generate unique invoice number. Please try again.');
        return;
      }

      let remainingToSell = litersSold;
      const lineItems = [];

      for (const item of inventoryItems) {
        if (remainingToSell <= 0) break;

        const litersFromThisItem = Math.min(item.remaining_liters, remainingToSell);

        lineItems.push({
          invoice_id: invoiceData.id,
          inventory_item_id: item.id,
          liters_from_item: litersFromThisItem,
          cost_per_liter: item.cost_per_liter,
          selling_price_per_liter: effectivePrice,
          is_test_data: isTestingMode,
        });

        const newRemaining = item.remaining_liters - litersFromThisItem;

        await supabase
          .from('inventory_items')
          .update({ remaining_liters: newRemaining })
          .eq('id', item.id);

        remainingToSell -= litersFromThisItem;
      }

      await supabase.from('invoice_line_items').insert(lineItems);

      const { data: updatedItems } = await supabase
        .from('inventory_items')
        .select('remaining_liters')
        .eq('tank_id', tankId)
        .gt('remaining_liters', 0);

      const newTankLiters = (updatedItems || []).reduce(
        (sum, item) => sum + item.remaining_liters,
        0
      );

      await supabase
        .from('inventory_tanks')
        .update({ current_liters: newTankLiters })
        .eq('id', tankId);

      setShowInvoiceModal(false);
      setSelectedClient('');
      setSelectedVehicle('');
      loadData();
    } finally {
      setSubmitting(false);
    }
  }

  function downloadInvoicePDF(invoice: Invoice) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.text('INVOICE', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text('Oshali Fuel', pageWidth / 2, 30, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`Invoice #: ${invoice.invoice_number}`, 20, 50);
    doc.text(`Date: ${format(new Date(invoice.created_at), 'MMM dd, yyyy')}`, 20, 58);
    doc.text(`Delivery Note: ${invoice.delivery_note_number}`, 20, 66);

    if (invoice.client) {
      doc.text('Bill To:', 120, 50);
      doc.text(invoice.client.name, 120, 58);
      if (invoice.client.po_box) doc.text(invoice.client.po_box, 120, 66);
      if (invoice.client.cell_number) doc.text(invoice.client.cell_number, 120, 74);
    }

    let yPos = 95;
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPos - 5, pageWidth - 40, 10, 'F');
    doc.setFontSize(10);
    doc.text('Description', 25, yPos);
    doc.text('Quantity', 90, yPos);
    doc.text('Unit Price', 120, yPos);
    doc.text('Amount', 160, yPos);

    yPos += 15;
    doc.text(invoice.item_description || 'Diesel Fuel', 25, yPos);
    doc.text(`${invoice.liters_sold.toLocaleString()} L`, 90, yPos);
    doc.text(formatCurrency(invoice.selling_price_per_liter), 120, yPos);
    doc.text(formatCurrency(invoice.total_amount), 160, yPos);

    yPos += 20;
    doc.line(20, yPos, pageWidth - 20, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.text('Total:', 120, yPos);
    doc.text(formatCurrency(invoice.total_amount), 160, yPos);

    yPos += 15;
    const statusText = invoice.status === 'settled' ? 'PAID' : invoice.status === 'void' ? 'VOID' : 'UNPAID';
    const statusColor = invoice.status === 'settled' ? [34, 197, 94] : invoice.status === 'void' ? [239, 68, 68] : [234, 179, 8];
    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.setFontSize(14);
    doc.text(statusText, pageWidth / 2, yPos, { align: 'center' });

    if (invoice.status === 'settled' && invoice.payment_method) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.text(`Payment Method: ${invoice.payment_method.toUpperCase()}`, pageWidth / 2, yPos + 8, { align: 'center' });
    }

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text('Thank you for your business!', pageWidth / 2, 270, { align: 'center' });

    doc.save(`Invoice-${invoice.invoice_number}.pdf`);
  }

  const canCreate =
    profile?.role === 'pump_attendant' ||
    profile?.role === 'operations_supervisor' ||
    profile?.role === 'super_admin';

  const canUpdateStatus =
    profile?.role === 'operations_supervisor' ||
    profile?.role === 'administrator' ||
    profile?.role === 'super_admin' ||
    profile?.role === 'general_manager';

  const clientVehiclesForSelected = clientVehicles.filter(v => v.client_id === selectedClient);

  const getStatusBadge = (status: string, paymentMethod?: string | null) => {
    switch (status) {
      case 'settled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-light rounded-full bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" strokeWidth={1.5} />
            Settled
            {paymentMethod && (
              <span className="ml-1 text-green-600">
                ({paymentMethod === 'card' ? 'Card' : paymentMethod === 'cash' ? 'Cash' : 'EFT'})
              </span>
            )}
          </span>
        );
      case 'void':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-light rounded-full bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" strokeWidth={1.5} />
            Void
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-light rounded-full bg-amber-100 text-amber-700">
            <Clock className="w-3 h-3" strokeWidth={1.5} />
            Unsettled
          </span>
        );
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const clientName = invoice.client?.name?.toLowerCase() || 'walk-in';
    const invoiceNumber = invoice.invoice_number?.toLowerCase() || '';
    const deliveryNote = invoice.delivery_note_number?.toLowerCase() || '';
    return clientName.includes(query) || invoiceNumber.includes(query) || deliveryNote.includes(query);
  });

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-light">Sales</h1>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('invoices')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-light transition-colors ${
                activeTab === 'invoices'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" strokeWidth={1.5} />
              Invoices
            </button>
            <button
              onClick={() => setActiveTab('delivery_notes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-light transition-colors relative ${
                activeTab === 'delivery_notes'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Truck className="w-4 h-4" strokeWidth={1.5} />
              Delivery Notes
              {deliveryNotes.filter(dn => !dn.has_invoice).length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {deliveryNotes.filter(dn => !dn.has_invoice).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('statistics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-light transition-colors ${
                activeTab === 'statistics'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" strokeWidth={1.5} />
              Statistics
            </button>
          </div>
        </div>
        {activeTab === 'invoices' && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={1.5} />
              <input
                type="text"
                placeholder="Search client, invoice, delivery note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm font-light border border-gray-200 rounded-lg w-72 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              />
            </div>
            {canCreate && (
              <Button onClick={() => setShowInvoiceModal(true)}>
                <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
                New Invoice
              </Button>
            )}
          </div>
        )}
      </div>

      {activeTab === 'statistics' ? (
        <SalesStatistics />
      ) : activeTab === 'delivery_notes' ? (
        <div className="space-y-4">
          {deliveryNotes.length === 0 ? (
            <Card>
              <p className="text-sm font-light text-gray-500 text-center py-8">
                No delivery notes found
              </p>
            </Card>
          ) : (
            deliveryNotes.map((note) => (
              <Card key={note.id} className={note.has_invoice ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="font-light text-lg">{note.note_number}</span>
                      {note.has_invoice ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-light rounded-full bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" strokeWidth={1.5} />
                          Invoice Created
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-light rounded-full bg-amber-100 text-amber-700">
                          <Bell className="w-3 h-3" strokeWidth={1.5} />
                          Pending Invoice
                        </span>
                      )}
                      <span className="text-xs font-light text-gray-500">
                        {format(new Date(note.created_at), 'MMM dd, yyyy HH:mm')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm font-light">
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Customer</div>
                        <div>{note.customer_name}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Vehicle</div>
                        <div>{note.vehicle_registration}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Driver</div>
                        <div>{note.driver_name}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Liter Reading</div>
                        <div className="font-medium">{note.litres_reading.toLocaleString()}L</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-xs mb-1">Attendant</div>
                        <div>{note.attendant_name}</div>
                      </div>
                    </div>
                    {note.meter_photo_url && (
                      <div className="mt-3">
                        <img
                          src={note.meter_photo_url}
                          alt="Meter reading"
                          className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => printDeliveryNote(note)}
                    >
                      <Printer className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                      Print
                    </Button>
                    {!note.has_invoice && (
                      <Button
                        onClick={() => {
                          setSelectedDeliveryNote(note);
                          setSelectedClient(note.client_id || '');
                          setShowInvoiceModal(true);
                        }}
                      >
                        Create Invoice
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : (
        <>
          {currentPrice === 0 && (
        <Card className="mb-6 bg-yellow-50 border-yellow-200">
          <p className="text-sm font-light text-yellow-800">
            No selling price set. Contact General Manager to set pricing.
          </p>
        </Card>
      )}

      {loading ? (
        <OshaliLoader variant="inline" />
      ) : (
        <div className="space-y-4">
          {filteredInvoices.length === 0 && searchQuery && (
            <Card>
              <p className="text-sm font-light text-gray-500 text-center py-8">
                No invoices found matching "{searchQuery}"
              </p>
            </Card>
          )}
          {paginatedInvoices.map((invoice) => (
            <Card key={invoice.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-light">{invoice.invoice_number}</span>
                    {getStatusBadge(invoice.status, invoice.payment_method)}
                    <span className="text-xs font-light text-gray-500">
                      {format(new Date(invoice.created_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm font-light">
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Client</div>
                      <div>{invoice.client?.name || 'Walk-in'}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Delivery Note</div>
                      <div>{invoice.delivery_note_number}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Liters</div>
                      <div>{invoice.liters_sold.toLocaleString()}L</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Price/L</div>
                      <div>{formatCurrency(invoice.selling_price_per_liter)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Total</div>
                      <div className="font-medium">{formatCurrency(invoice.total_amount)}</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleViewInvoice(invoice)}>
                    <Eye className="w-4 h-4" strokeWidth={1} />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadInvoicePDF(invoice)}>
                    <Download className="w-4 h-4" strokeWidth={1} />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => printInvoice(invoice, printConfig)}>
                    <Printer className="w-4 h-4" strokeWidth={1} />
                  </Button>
                  {canUpdateStatus && invoice.status !== 'void' && (
                    <Button size="sm" variant="outline" onClick={() => openStatusModal(invoice)}>
                      Status
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {filteredInvoices.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
              <div className="flex items-center gap-2 text-sm font-light text-gray-600">
                <span>Show</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredInvoices.length)} of {filteredInvoices.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`w-8 h-8 rounded-lg text-sm font-light transition-colors ${
                          currentPage === pageNumber
                            ? 'bg-black text-white'
                            : 'bg-white border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}

      <Modal
        isOpen={showInvoiceModal}
        onClose={() => {
          if (!submitting) {
            setShowInvoiceModal(false);
            setSelectedDeliveryNote(null);
          }
        }}
        title={selectedDeliveryNote ? "Create Invoice from Delivery Note" : "Create Invoice"}
        size="lg"
      >
        {selectedDeliveryNote ? (
          <div className="relative">
            {submitting && <OshaliLoader variant="overlay" message="Creating invoice..." />}
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const tankId = formData.get('tank') as string;
            handleCreateInvoiceFromDeliveryNote(selectedDeliveryNote, tankId);
          }}>
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <div className="text-sm font-light text-blue-900 mb-3">Delivery Note Details</div>
                <div className="grid grid-cols-2 gap-3 text-sm font-light">
                  <div>
                    <div className="text-blue-700 mb-1">Note Number</div>
                    <div className="text-blue-900">{selectedDeliveryNote.note_number}</div>
                  </div>
                  <div>
                    <div className="text-blue-700 mb-1">Customer</div>
                    <div className="text-blue-900">{selectedDeliveryNote.customer_name}</div>
                  </div>
                  <div>
                    <div className="text-blue-700 mb-1">Vehicle</div>
                    <div className="text-blue-900">{selectedDeliveryNote.vehicle_registration}</div>
                  </div>
                  <div>
                    <div className="text-blue-700 mb-1">Liters</div>
                    <div className="text-blue-900 font-medium">{selectedDeliveryNote.litres_reading}L</div>
                  </div>
                </div>
              </div>

              <Select name="tank" label="Tank" required>
                <option value="">Select tank...</option>
                {tanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    Tank {tank.tank_name} ({tank.current_liters.toLocaleString()}L available)
                  </option>
                ))}
              </Select>

              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="text-sm font-light text-gray-600 mb-1">Selling Price</div>
                <div className="text-xl font-light">{formatCurrency(effectivePrice)}/L</div>
                {selectedClient && clients.find(c => c.id === selectedClient)?.custom_price_per_liter && (
                  <div className="text-xs text-green-600 mt-1">Custom client pricing applied</div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={effectivePrice === 0 || submitting}>
                  {submitting ? 'Creating...' : 'Create Invoice'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowInvoiceModal(false);
                    setSelectedDeliveryNote(null);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </form>
          </div>
        ) : (
          <div className="relative">
            {submitting && <OshaliLoader variant="overlay" message="Creating invoice..." />}
          <form onSubmit={(e) => { e.preventDefault(); handleCreateInvoice(new FormData(e.currentTarget)); }}>
          <div className="space-y-4">
            <Input name="deliveryNote" label="Delivery Note Number" required />

            <Input
              name="itemDescription"
              label="Item Description"
              defaultValue="Diesel Fuel"
              placeholder="e.g., Diesel Fuel, Petrol"
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                name="invoiceDate"
                label="Invoice Date"
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                required
              />
              <Input
                name="dueDate"
                label="Due Date"
                type="date"
                defaultValue={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <Select
              label="Client (Optional)"
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setSelectedVehicle('');
              }}
            >
              <option value="">Walk-in Customer</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.custom_price_per_liter && ` (${formatCurrency(client.custom_price_per_liter)}/L)`}
                </option>
              ))}
            </Select>

            {selectedClient && clientVehiclesForSelected.length > 0 && (
              <Select
                label="Vehicle (Optional)"
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
              >
                <option value="">No vehicle selected</option>
                {clientVehiclesForSelected.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.registration_number}
                    {vehicle.make && ` - ${vehicle.make}`}
                    {vehicle.model && ` ${vehicle.model}`}
                  </option>
                ))}
              </Select>
            )}

            <Input name="liters" label="Liters Sold" type="number" step="0.01" required />

            <Select name="tank" label="Tank" required>
              <option value="">Select tank...</option>
              {tanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  Tank {tank.tank_name} ({tank.current_liters.toLocaleString()}L available)
                </option>
              ))}
            </Select>

            <div className="p-4 bg-gray-50 rounded-xl">
              <div className="text-sm font-light text-gray-600 mb-1">Selling Price</div>
              <div className="text-xl font-light">{formatCurrency(effectivePrice)}/L</div>
              {selectedClient && clients.find(c => c.id === selectedClient)?.custom_price_per_liter && (
                <div className="text-xs text-green-600 mt-1">Custom client pricing applied</div>
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={effectivePrice === 0 || submitting}>
                {submitting ? 'Creating...' : 'Create Invoice'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowInvoiceModal(false)} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="Update Invoice Status"
      >
        <div className="space-y-4">
          <Select
            label="Status"
            value={statusForm.status}
            onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
          >
            <option value="unsettled">Unsettled</option>
            <option value="settled">Settled</option>
            <option value="void">Void</option>
          </Select>

          {statusForm.status === 'settled' && (
            <div className="space-y-3">
              <label className="block text-sm font-light text-gray-700">Payment Method *</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setStatusForm({ ...statusForm, payment_method: 'card' })}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                    statusForm.payment_method === 'card'
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCard className="w-6 h-6" strokeWidth={1} />
                  <span className="text-sm font-light">Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusForm({ ...statusForm, payment_method: 'cash' })}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                    statusForm.payment_method === 'cash'
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Banknote className="w-6 h-6" strokeWidth={1} />
                  <span className="text-sm font-light">Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusForm({ ...statusForm, payment_method: 'eft' })}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                    statusForm.payment_method === 'eft'
                      ? 'border-black bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Building2 className="w-6 h-6" strokeWidth={1} />
                  <span className="text-sm font-light">EFT</span>
                </button>
              </div>
            </div>
          )}

          {statusForm.status === 'void' && (
            <div className="p-4 bg-red-50 rounded-xl">
              <p className="text-sm font-light text-red-700">
                Warning: Voiding an invoice is permanent and cannot be undone.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleUpdateStatus} className="flex-1">
              Update Status
            </Button>
            <Button variant="secondary" onClick={() => setShowStatusModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showViewModal}
        onClose={() => { setShowViewModal(false); setSelectedInvoice(null); setInvoiceLineItems([]); }}
        title="Invoice Details"
        size="lg"
      >
        {selectedInvoice && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="grid grid-cols-2 gap-4 font-light flex-1">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Invoice Number</div>
                  <div className="font-normal">{selectedInvoice.invoice_number || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Date</div>
                  <div>{selectedInvoice.created_at ? format(new Date(selectedInvoice.created_at), 'MMM dd, yyyy HH:mm') : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Client</div>
                  <div>{selectedInvoice.client?.name || 'Walk-in Customer'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Delivery Note</div>
                  <div>{selectedInvoice.delivery_note_number || '-'}</div>
                </div>
              </div>
              <div>
                {getStatusBadge(selectedInvoice.status, selectedInvoice.payment_method)}
              </div>
            </div>

            {selectedInvoice.client_vehicle && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm font-light text-gray-600 mb-3">Vehicle Information</div>
                <div className="font-light text-sm">
                  <span className="font-medium">{selectedInvoice.client_vehicle.registration_number}</span>
                  {selectedInvoice.client_vehicle.make && ` - ${selectedInvoice.client_vehicle.make}`}
                  {selectedInvoice.client_vehicle.model && ` ${selectedInvoice.client_vehicle.model}`}
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm font-light text-blue-900 mb-3">Client Invoice Summary</div>
              <div className="grid grid-cols-4 gap-4 font-light text-sm">
                <div>
                  <div className="text-blue-700 mb-1">Description</div>
                  <div className="text-blue-900">{selectedInvoice.item_description || 'Diesel Fuel'}</div>
                </div>
                <div>
                  <div className="text-blue-700 mb-1">Quantity</div>
                  <div className="text-blue-900">{selectedInvoice.liters_sold?.toLocaleString() || 0}L</div>
                </div>
                <div>
                  <div className="text-blue-700 mb-1">Unit Price</div>
                  <div className="text-blue-900">{formatCurrency(selectedInvoice.selling_price_per_liter || 0)}</div>
                </div>
                <div>
                  <div className="text-blue-700 mb-1">Total</div>
                  <div className="text-blue-900 font-medium">{formatCurrency(selectedInvoice.total_amount || 0)}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-light text-gray-600 mb-3">Internal FIFO Breakdown</div>
              <div className="space-y-2">
                {invoiceLineItems.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">Loading line items...</div>
                ) : (
                  invoiceLineItems.map((item: any, index) => (
                    <div key={item.id} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-light text-gray-500">
                          Item {index + 1} - GR {item.inventory_item_id?.gr_id?.gr_number || 'N/A'}
                        </span>
                        <span className="text-xs font-light px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          FIFO #{index + 1}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm font-light">
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Liters</div>
                          <div>{item.liters_from_item.toLocaleString()}L</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Cost/L</div>
                          <div>{formatCurrency(item.cost_per_liter)}</div>
                        </div>
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Profit/L</div>
                          <div className="text-green-600">
                            {formatCurrency(item.selling_price_per_liter - item.cost_per_liter)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {invoiceLineItems.length > 0 && (
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center justify-between text-sm font-light">
                  <span className="text-gray-600">Total Profit</span>
                  <span className="text-green-700 font-normal text-lg">
                    {formatCurrency(invoiceLineItems.reduce((sum, item) => sum + (item.total_profit || 0), 0))}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => printInvoice(selectedInvoice!, printConfig)} className="flex-1">
                <Printer className="w-4 h-4 mr-2" strokeWidth={1} />
                Print Invoice
              </Button>
              <Button variant="secondary" onClick={() => downloadInvoicePDF(selectedInvoice)} className="flex-1">
                <Download className="w-4 h-4 mr-2" strokeWidth={1} />
                Download Invoice
              </Button>
              <Button variant="secondary" onClick={() => { setShowViewModal(false); setSelectedInvoice(null); setInvoiceLineItems([]); }}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
