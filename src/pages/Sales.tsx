import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Plus, Eye, Download, CheckCircle, XCircle, Clock, CreditCard, Banknote, Building2, Search, BarChart3, FileText, Truck, Bell, Printer, Filter, Calendar, Trash2, CheckSquare, Square } from 'lucide-react';
import SalesStatistics from '../components/SalesStatistics';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { printDeliveryNote } from '../lib/printDeliveryNote';
import { printInvoice, buildInvoiceHTML, DEFAULT_PRINT_CONFIG, PrintConfig } from '../lib/printInvoice';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

async function fetchAllInvoicesWithPagination(testMode: boolean): Promise<any[]> {
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
      .eq('is_test_data', testMode)
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
  invoice_date?: string | null;
  due_date?: string | null;
  payment_reference?: string | null;
  shift?: number | null;
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
    payment_reference: '',
    payment_date: new Date().toISOString().split('T')[0],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string>(searchParams.get('status') || 'all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'invoices' | 'statistics' | 'delivery_notes' | 'bulk_delete'>(
    (searchParams.get('tab') as 'invoices' | 'statistics' | 'delivery_notes' | 'bulk_delete') || 'invoices'
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [printConfig, setPrintConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [bulkDeleteDocType, setBulkDeleteDocType] = useState<'delivery_notes' | 'invoices'>('delivery_notes');
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [bulkCurrentPage, setBulkCurrentPage] = useState(1);
  const [bulkItemsPerPage, setBulkItemsPerPage] = useState(25);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteFeedback, setBulkDeleteFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [isTestingMode]);

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
        fetchAllInvoicesWithPagination(isTestingMode),
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
      payment_reference: (invoice as any).payment_reference || '',
      payment_date: invoice.settled_at
        ? new Date(invoice.settled_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    });
    setShowStatusModal(true);
  }

  async function handleUpdateStatus() {
    if (!selectedInvoice || !profile) return;

    if (statusForm.status === 'settled' && !statusForm.payment_method) {
      alert('Please select a payment method');
      return;
    }

    if (statusForm.status === 'settled' && !statusForm.payment_date) {
      alert('Please select a payment date');
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
        payment_reference: statusForm.payment_reference?.trim() || null,
      };

      if (statusForm.status === 'settled') {
        const paymentDate = new Date(statusForm.payment_date + 'T12:00:00');
        updateData.settled_at = paymentDate.toISOString();
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

  async function handleCreateInvoiceFromDeliveryNote(deliveryNote: DeliveryNote, tankId: string, invoiceDate: string, shift: number) {
    if (!profile || submitting) return;

    setSubmitting(true);
    try {
      const litersSold = Math.round((deliveryNote.litres_reading || deliveryNote.litres_dispensed) * 100) / 100;
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

      const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc('generate_invoice_number');
      if (invoiceNumberError) throw invoiceNumberError;
      const invoiceNumber = invoiceNumberData as string;

      const invoiceResult = await supabase
        .from('invoices')
        .insert([{
          invoice_number: invoiceNumber,
          delivery_note_number: deliveryNote.note_number,
          client_id: clientId,
          vehicle_id: null,
          liters_sold: litersSold,
          tank_id: tankId,
          selling_price_per_liter: effectivePrice,
          item_description: 'Diesel Fuel',
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          shift: shift,
          status: 'unsettled',
          created_by: profile.id,
          is_test_data: isTestingMode,
        }])
        .select()
        .single();

      if (invoiceResult.error) {
        alert('Error creating invoice');
        return;
      }

      const invoiceData = invoiceResult.data;

      let remainingToSell = litersSold;
      const lineItems = [];

      for (const item of inventoryItems) {
        if (remainingToSell <= 0) break;

        const litersFromThisItem = Math.round(Math.min(item.remaining_liters, remainingToSell) * 100) / 100;

        lineItems.push({
          invoice_id: invoiceData.id,
          inventory_item_id: item.id,
          liters_from_item: litersFromThisItem,
          cost_per_liter: item.cost_per_liter,
          selling_price_per_liter: effectivePrice,
          is_test_data: isTestingMode,
        });

        const newRemaining = Math.round((item.remaining_liters - litersFromThisItem) * 100) / 100;

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
      setSearchParams({ tab: 'invoices' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateInvoice(formData: FormData) {
    if (!profile || submitting) return;

    setSubmitting(true);
    try {
      const litersSold = Math.round(parseFloat(formData.get('liters') as string) * 100) / 100;
      const tankId = formData.get('tank') as string;
      const deliveryNote = formData.get('deliveryNote') as string;
      const itemDescription = formData.get('itemDescription') as string || 'Diesel Fuel';
      const invoiceDate = formData.get('invoiceDate') as string;
      const dueDate = formData.get('dueDate') as string;
      const shift = parseInt(formData.get('shift') as string) || 1;
      const paymentReference = (formData.get('paymentReference') as string)?.trim() || null;

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

      const { data: invoiceNumberData2, error: invoiceNumberError2 } = await supabase.rpc('generate_invoice_number');
      if (invoiceNumberError2) throw invoiceNumberError2;
      const invoiceNumber2 = invoiceNumberData2 as string;

      const invoiceResult2 = await supabase
        .from('invoices')
        .insert([{
          invoice_number: invoiceNumber2,
          delivery_note_number: deliveryNote,
          client_id: selectedClient || null,
          vehicle_id: selectedVehicle || null,
          liters_sold: litersSold,
          tank_id: tankId,
          selling_price_per_liter: effectivePrice,
          item_description: itemDescription,
          invoice_date: invoiceDate,
          due_date: dueDate,
          shift: shift,
          payment_reference: paymentReference,
          status: 'unsettled',
          created_by: profile.id,
          is_test_data: isTestingMode,
        }])
        .select()
        .single();

      if (invoiceResult2.error) {
        alert('Error creating invoice');
        return;
      }

      const invoiceData = invoiceResult2.data;

      let remainingToSell = litersSold;
      const lineItems = [];

      for (const item of inventoryItems) {
        if (remainingToSell <= 0) break;

        const litersFromThisItem = Math.round(Math.min(item.remaining_liters, remainingToSell) * 100) / 100;

        lineItems.push({
          invoice_id: invoiceData.id,
          inventory_item_id: item.id,
          liters_from_item: litersFromThisItem,
          cost_per_liter: item.cost_per_liter,
          selling_price_per_liter: effectivePrice,
          is_test_data: isTestingMode,
        });

        const newRemaining = Math.round((item.remaining_liters - litersFromThisItem) * 100) / 100;

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

  async function downloadInvoicePDF(invoice: Invoice) {
    const linkedDN      = deliveryNotes.find(
      (dn) => dn.note_number === invoice.delivery_note_number
    );
    const driverName    = linkedDN?.driver_name    ?? '';
    const attendantName = linkedDN?.attendant_name ?? '';

    const html = buildInvoiceHTML(invoice, printConfig, driverName, attendantName);

    // Render HTML in a hidden off-screen container
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;';
    container.innerHTML = html;
    document.body.appendChild(container);

    // Hide print toolbar so it doesn't appear in the PDF
    const toolbar = container.querySelector<HTMLElement>('.no-print');
    if (toolbar) toolbar.style.display = 'none';

    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth   = pageWidth;
      const imgHeight  = (canvas.height * pageWidth) / canvas.width;
      // Handle multi-page if content is taller than one A4 page
      let yOffset = 0;
      while (yOffset < imgHeight) {
        if (yOffset > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yOffset, imgWidth, imgHeight);
        yOffset += pageHeight;
      }
      pdf.save(`Invoice-${invoice.invoice_number}.pdf`);
    } finally {
      if (toolbar) toolbar.style.display = '';
      document.body.removeChild(container);
    }
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

  const canBulkDelete = profile?.role === 'super_admin';

  function toggleBulkSelection(id: string) {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getBulkDeleteList() {
    const q = bulkSearchQuery.toLowerCase();
    if (bulkDeleteDocType === 'delivery_notes') {
      return deliveryNotes.filter((n) =>
        n.note_number.toLowerCase().includes(q) ||
        n.customer_name.toLowerCase().includes(q) ||
        (n.vehicle_registration || '').toLowerCase().includes(q)
      );
    }
    return invoices.filter((i) =>
      i.invoice_number.toLowerCase().includes(q) ||
      (i.delivery_note_number || '').toLowerCase().includes(q) ||
      (i.client?.name || '').toLowerCase().includes(q)
    );
  }

  function toggleBulkSelectAll() {
    const items = getBulkDeleteList();
    const ids = items.map((it: any) => it.id);
    const allSelected = ids.length > 0 && ids.every((id) => bulkSelectedIds.has(id));
    setBulkSelectedIds(allSelected ? new Set() : new Set(ids));
  }

  async function handleBulkDelete() {
    if (bulkSelectedIds.size === 0) return;
    setBulkDeleting(true);
    setBulkDeleteFeedback(null);

    try {
      const ids = Array.from(bulkSelectedIds);
      let successCount = 0;
      let errorCount = 0;

      for (const id of ids) {
        const rpcName = bulkDeleteDocType === 'delivery_notes' ? 'delete_delivery_note' : 'delete_invoice';
        const paramName = bulkDeleteDocType === 'delivery_notes' ? 'p_dn_id' : 'p_invoice_id';
        const { error } = await supabase.rpc(rpcName, { [paramName]: id });
        if (error) {
          console.error(`Failed to delete ${id}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      const label = bulkDeleteDocType === 'delivery_notes' ? 'delivery note' : 'invoice';
      if (errorCount === 0) {
        setBulkDeleteFeedback({ type: 'success', message: `Successfully deleted ${successCount} ${label}${successCount > 1 ? 's' : ''}.` });
      } else {
        setBulkDeleteFeedback({ type: 'error', message: `Deleted ${successCount}, failed ${errorCount}.` });
      }

      setShowBulkDeleteConfirm(false);
      setBulkSelectedIds(new Set());
      await loadData();
    } catch (error: any) {
      setBulkDeleteFeedback({ type: 'error', message: error.message || 'Bulk delete failed' });
    } finally {
      setBulkDeleting(false);
    }
  }

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
    if (filterStatus !== 'all' && invoice.status !== filterStatus) return false;
    if (filterClient !== 'all' && invoice.client_id !== filterClient) return false;
    if (filterDateFrom) {
      const invoiceDate = invoice.invoice_date || invoice.created_at.split('T')[0];
      if (invoiceDate < filterDateFrom) return false;
    }
    if (filterDateTo) {
      const invoiceDate = invoice.invoice_date || invoice.created_at.split('T')[0];
      if (invoiceDate > filterDateTo) return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const clientName = invoice.client?.name?.toLowerCase() || 'walk-in';
      const invoiceNumber = invoice.invoice_number?.toLowerCase() || '';
      const deliveryNote = invoice.delivery_note_number?.toLowerCase() || '';
      return clientName.includes(query) || invoiceNumber.includes(query) || deliveryNote.includes(query);
    }
    return true;
  });

  async function downloadAllInvoicesPDF() {
    if (filteredInvoices.length === 0) return;

    const { default: autoTable } = await import('jspdf-autotable');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    pdf.setFontSize(16);
    pdf.text('Invoice Report', 14, 18);
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    const subtitle = filterStatus !== 'all' || filterClient !== 'all' || filterDateFrom || filterDateTo
      ? `Filtered: ${filteredInvoices.length} invoices`
      : `All invoices: ${filteredInvoices.length}`;
    pdf.text(`${subtitle}  |  Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, 14, 24);
    pdf.setTextColor(0);

    const tableData = filteredInvoices.map((inv) => [
      inv.invoice_number,
      format(new Date((inv.invoice_date || inv.created_at.split('T')[0]) + 'T00:00:00'), 'dd/MM/yyyy'),
      inv.client?.name || 'Walk-in',
      inv.delivery_note_number,
      `${inv.liters_sold.toLocaleString()}L`,
      formatCurrency(inv.selling_price_per_liter),
      formatCurrency(inv.total_amount),
      inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
      inv.payment_method ? inv.payment_method.toUpperCase() : '-',
    ]);

    const totalAmount = filteredInvoices.reduce((s, i) => s + i.total_amount, 0);
    const totalLiters = filteredInvoices.reduce((s, i) => s + i.liters_sold, 0);

    autoTable(pdf, {
      startY: 30,
      head: [['Invoice #', 'Date', 'Client', 'DN #', 'Liters', 'Price/L', 'Total', 'Status', 'Payment']],
      body: tableData,
      foot: [['', '', '', 'TOTALS', `${totalLiters.toLocaleString()}L`, '', formatCurrency(totalAmount), '', '']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      margin: { left: 14, right: 14 },
    });

    const dateSuffix = format(new Date(), 'yyyy-MM-dd');
    pdf.save(`Invoices-${dateSuffix}.pdf`);
  }

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
              onClick={() => { setActiveTab('invoices'); setSearchParams({ tab: 'invoices' }); }}
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
              onClick={() => { setActiveTab('delivery_notes'); setSearchParams({ tab: 'delivery_notes' }); }}
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
              onClick={() => { setActiveTab('statistics'); setSearchParams({ tab: 'statistics' }); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-light transition-colors ${
                activeTab === 'statistics'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" strokeWidth={1.5} />
              Statistics
            </button>
            {canBulkDelete && (
              <button
                onClick={() => { setActiveTab('bulk_delete'); setSearchParams({ tab: 'bulk_delete' }); setBulkSelectedIds(new Set()); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-light transition-colors ${
                  activeTab === 'bulk_delete'
                    ? 'bg-white text-red-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                Bulk Delete
              </button>
            )}
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
            {filteredInvoices.length > 0 && (
              <Button variant="secondary" onClick={() => void downloadAllInvoicesPDF()}>
                <Download className="w-4 h-4 mr-2" strokeWidth={1} />
                Download All
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setShowInvoiceModal(true)}>
                <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
                New Invoice
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Invoice Filters */}
      {activeTab === 'invoices' && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Filter className="w-4 h-4 text-gray-400" strokeWidth={1} />
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
            className="text-sm font-light border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="all">All statuses</option>
            <option value="unsettled">Unsettled</option>
            <option value="settled">Settled</option>
            <option value="void">Void</option>
          </select>
          <select
            value={filterClient}
            onChange={(e) => { setFilterClient(e.target.value); setCurrentPage(1); }}
            className="text-sm font-light border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="all">All customers</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" strokeWidth={1} />
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setCurrentPage(1); }}
              className="text-xs font-light border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setCurrentPage(1); }}
              className="text-xs font-light border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
          </div>
          {(filterStatus !== 'all' || filterClient !== 'all' || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterStatus('all'); setFilterClient('all'); setFilterDateFrom(''); setFilterDateTo(''); setCurrentPage(1); }}
              className="text-xs font-light text-gray-500 hover:text-gray-800 underline transition-colors"
            >
              Clear filters
            </button>
          )}
          {filteredInvoices.length > 0 && (filterStatus !== 'all' || filterClient !== 'all' || filterDateFrom || filterDateTo) && (
            <span className="ml-auto text-xs font-light text-gray-500">
              {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} · {formatCurrency(filteredInvoices.reduce((s, i) => s + i.total_amount, 0))}
            </span>
          )}
        </div>
      )}

      {activeTab === 'statistics' ? (
        <SalesStatistics />
      ) : activeTab === 'bulk_delete' && canBulkDelete ? (
        <div className="space-y-4">
          {bulkDeleteFeedback && (
            <div className={`p-4 rounded-lg border ${
              bulkDeleteFeedback.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <p className="text-sm font-light">{bulkDeleteFeedback.message}</p>
            </div>
          )}

          <Card className="bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <Trash2 className="w-5 h-5 text-amber-700 mt-0.5" strokeWidth={1.5} />
              <div>
                <p className="text-sm font-medium text-amber-900">Bulk Delete Mode</p>
                <p className="text-xs font-light text-amber-800 mt-1">
                  Select multiple documents to delete at once. Deleting invoices will restore sold fuel back to inventory and update tank levels. This action cannot be undone.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => { setBulkDeleteDocType('delivery_notes'); setBulkSelectedIds(new Set()); setBulkCurrentPage(1); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-light transition-colors ${
                  bulkDeleteDocType === 'delivery_notes'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Truck className="w-4 h-4" strokeWidth={1.5} />
                Delivery Notes ({deliveryNotes.length})
              </button>
              <button
                onClick={() => { setBulkDeleteDocType('invoices'); setBulkSelectedIds(new Set()); setBulkCurrentPage(1); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-light transition-colors ${
                  bulkDeleteDocType === 'invoices'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" strokeWidth={1.5} />
                Invoices ({invoices.length})
              </button>
            </div>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" strokeWidth={1.5} />
              <input
                type="text"
                placeholder={`Search ${bulkDeleteDocType === 'delivery_notes' ? 'delivery notes' : 'invoices'}...`}
                value={bulkSearchQuery}
                onChange={(e) => { setBulkSearchQuery(e.target.value); setBulkCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 text-sm font-light border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleBulkSelectAll}
                className="flex items-center gap-2 text-sm font-light text-gray-700 hover:text-gray-900"
              >
                {(() => {
                  const items = getBulkDeleteList();
                  const allSelected = items.length > 0 && items.every((it: any) => bulkSelectedIds.has(it.id));
                  return allSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" strokeWidth={1.5} />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" strokeWidth={1.5} />
                  );
                })()}
                Select All
              </button>
              <span className="text-sm font-light text-gray-500">
                {bulkSelectedIds.size} of {getBulkDeleteList().length} selected
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={bulkSelectedIds.size === 0}
              className="!text-red-600 !border-red-300 hover:!bg-red-50 disabled:!text-gray-400 disabled:!border-gray-200"
            >
              <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.5} />
              Delete Selected ({bulkSelectedIds.size})
            </Button>
          </div>

          {(() => {
            const fullList = getBulkDeleteList();
            const totalItems = fullList.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / bulkItemsPerPage));
            const safePage = Math.min(bulkCurrentPage, totalPages);
            const startIdx = (safePage - 1) * bulkItemsPerPage;
            const endIdx = startIdx + bulkItemsPerPage;
            const paginated = fullList.slice(startIdx, endIdx);

            return (
              <>
                <div className="space-y-2">
                  {totalItems === 0 ? (
                    <Card>
                      <p className="text-sm font-light text-gray-500 text-center py-8">
                        No {bulkDeleteDocType === 'delivery_notes' ? 'delivery notes' : 'invoices'} found
                      </p>
                    </Card>
                  ) : bulkDeleteDocType === 'delivery_notes' ? (
                    (paginated as typeof deliveryNotes).map((note) => (
                      <div
                        key={note.id}
                        onClick={() => toggleBulkSelection(note.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          bulkSelectedIds.has(note.id)
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        {bulkSelectedIds.has(note.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" strokeWidth={1.5} />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400 shrink-0" strokeWidth={1.5} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-light text-sm">{note.note_number}</span>
                            {note.has_invoice && (
                              <span className="text-xs font-light bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                Invoiced
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-light text-gray-600 truncate mt-0.5">
                            {note.customer_name} - {note.vehicle_registration} - {note.driver_name}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-light">{note.litres_reading?.toLocaleString() || note.litres_dispensed?.toLocaleString()}L</p>
                          <p className="text-xs font-light text-gray-500">{format(new Date(note.created_at), 'dd/MM/yyyy')}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    (paginated as typeof invoices).map((invoice) => (
                      <div
                        key={invoice.id}
                        onClick={() => toggleBulkSelection(invoice.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          bulkSelectedIds.has(invoice.id)
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        {bulkSelectedIds.has(invoice.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" strokeWidth={1.5} />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400 shrink-0" strokeWidth={1.5} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-light text-sm">{invoice.invoice_number}</span>
                            <span className={`text-xs font-light px-1.5 py-0.5 rounded ${
                              invoice.status === 'settled'
                                ? 'bg-green-100 text-green-700'
                                : invoice.status === 'void'
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {invoice.status}
                            </span>
                          </div>
                          <p className="text-xs font-light text-gray-600 truncate mt-0.5">
                            {invoice.client?.name || 'Walk-in'} - {invoice.delivery_note_number}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-light">{formatCurrency(invoice.total_amount)}</p>
                          <p className="text-xs font-light text-gray-500">{format(new Date(invoice.invoice_date || invoice.created_at), 'dd/MM/yyyy')}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {totalItems > 0 && (
                  <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <div className="flex items-center gap-2 text-sm font-light text-gray-600">
                      <span>Show</span>
                      <select
                        value={bulkItemsPerPage}
                        onChange={(e) => { setBulkItemsPerPage(Number(e.target.value)); setBulkCurrentPage(1); }}
                        className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span>
                        Showing {startIdx + 1}-{Math.min(endIdx, totalItems)} of {totalItems}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setBulkCurrentPage(safePage - 1)}
                        disabled={safePage === 1}
                      >
                        Previous
                      </Button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNumber;
                          if (totalPages <= 5) {
                            pageNumber = i + 1;
                          } else if (safePage <= 3) {
                            pageNumber = i + 1;
                          } else if (safePage >= totalPages - 2) {
                            pageNumber = totalPages - 4 + i;
                          } else {
                            pageNumber = safePage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNumber}
                              onClick={() => setBulkCurrentPage(pageNumber)}
                              className={`w-8 h-8 rounded-lg text-sm font-light transition-colors ${
                                safePage === pageNumber
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
                        onClick={() => setBulkCurrentPage(safePage + 1)}
                        disabled={safePage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
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
                      {format(new Date(invoice.invoice_date || invoice.created_at), 'MMM dd, yyyy')}
                    </span>
                    {invoice.shift && (
                      <span className="text-xs font-light px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        S{invoice.shift}
                      </span>
                    )}
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
                  <Button size="sm" variant="secondary" onClick={() => void downloadInvoicePDF(invoice)}>
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
            const invoiceDate = formData.get('invoiceDate') as string;
            const shift = parseInt(formData.get('shift') as string) || 1;
            handleCreateInvoiceFromDeliveryNote(selectedDeliveryNote, tankId, invoiceDate, shift);
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

              <div className="grid grid-cols-2 gap-4">
                <Input
                  name="invoiceDate"
                  label="Invoice Date"
                  type="date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  required
                />
                <Select name="shift" label="Shift" required>
                  <option value="1">Shift 1 - Day</option>
                  <option value="2">Shift 2 - Night</option>
                </Select>
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

            <Select name="shift" label="Shift" required>
              <option value="1">Shift 1 - Day</option>
              <option value="2">Shift 2 - Night</option>
            </Select>

            <Input
              name="paymentReference"
              label="Payment Reference (Optional)"
              placeholder="e.g. EFT-20260514, CHQ-00123"
              maxLength={100}
            />

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

              <Input
                label="Payment Reference (Optional)"
                placeholder="e.g. EFT-20260514, CHQ-00123 — shared across bulk payments"
                maxLength={100}
                value={statusForm.payment_reference}
                onChange={(e) =>
                  setStatusForm((prev) => ({ ...prev, payment_reference: e.target.value }))
                }
              />

              <Input
                label="Payment Date *"
                type="date"
                value={statusForm.payment_date}
                onChange={(e) =>
                  setStatusForm((prev) => ({ ...prev, payment_date: e.target.value }))
                }
              />
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
                  <div className="text-sm text-gray-500 mb-1">Invoice Date</div>
                  <div>
                    {selectedInvoice.invoice_date
                      ? format(new Date(selectedInvoice.invoice_date), 'MMM dd, yyyy')
                      : selectedInvoice.created_at
                        ? format(new Date(selectedInvoice.created_at), 'MMM dd, yyyy')
                        : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Shift</div>
                  <div>{selectedInvoice.shift === 2 ? 'Shift 2 - Night' : 'Shift 1 - Day'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Client</div>
                  <div>{selectedInvoice.client?.name || 'Walk-in Customer'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Delivery Note</div>
                  <div>{selectedInvoice.delivery_note_number || '-'}</div>
                </div>
                {selectedInvoice.payment_reference && (
                  <div>
                    <div className="text-sm text-gray-500 mb-1">Payment Reference</div>
                    <div className="font-medium text-indigo-700">{selectedInvoice.payment_reference}</div>
                  </div>
                )}
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
                      <div className="grid grid-cols-4 gap-4 text-sm font-light">
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
                        <div>
                          <div className="text-gray-500 text-xs mb-1">Line Profit</div>
                          <div className="text-green-600 font-medium">
                            {formatCurrency(item.total_profit || (item.selling_price_per_liter - item.cost_per_liter) * item.liters_from_item)}
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
              <Button variant="secondary" onClick={() => void downloadInvoicePDF(selectedInvoice!)} className="flex-1">
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

      <Modal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        title="Confirm Bulk Delete"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-800">
              You are about to delete {bulkSelectedIds.size} {bulkDeleteDocType === 'delivery_notes' ? 'delivery note' : 'invoice'}{bulkSelectedIds.size > 1 ? 's' : ''}. This action cannot be undone.
            </p>
            {bulkDeleteDocType === 'invoices' && (
              <p className="text-xs font-light text-red-700 mt-2">
                Sold fuel will be restored back to inventory and tank levels will be updated.
              </p>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
            {Array.from(bulkSelectedIds).map((id) => {
              if (bulkDeleteDocType === 'delivery_notes') {
                const note = deliveryNotes.find((n) => n.id === id);
                return note ? (
                  <div key={id} className="flex items-center justify-between text-sm py-1.5 px-2 bg-gray-50 rounded">
                    <span className="font-light">{note.note_number}</span>
                    <span className="text-gray-500 font-light text-xs">{note.customer_name}</span>
                  </div>
                ) : null;
              }
              const inv = invoices.find((i) => i.id === id);
              return inv ? (
                <div key={id} className="flex items-center justify-between text-sm py-1.5 px-2 bg-gray-50 rounded">
                  <span className="font-light">{inv.invoice_number}</span>
                  <span className="text-gray-500 font-light text-xs">{formatCurrency(inv.total_amount)}</span>
                </div>
              ) : null;
            })}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex-1 !bg-red-600 hover:!bg-red-700 !text-white !border-red-600"
            >
              {bulkDeleting ? 'Deleting...' : `Delete ${bulkSelectedIds.size} Item${bulkSelectedIds.size > 1 ? 's' : ''}`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowBulkDeleteConfirm(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
