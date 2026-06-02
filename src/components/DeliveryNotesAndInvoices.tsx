import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from './OshaliLoader';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from './ui/Card';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Select from './ui/Select';
import { FileText, Printer, Download, Plus, Eye, Search, ChevronDown, Trash2, CheckSquare, Square } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { printDeliveryNote } from '../lib/printDeliveryNote';
import { printInvoice } from '../lib/printInvoice';
import jsPDF from 'jspdf';

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
  invoice_id: string | null;
  created_at: string;
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
  invoice_date: string | null;
  created_at: string;
  created_by: string;
  client?: { name: string; email?: string } | null;
}

interface Tank {
  id: string;
  tank_name: string;
  current_liters: number;
}

interface Client {
  id: string;
  name: string;
  custom_price_per_liter: number | null;
}

export default function DeliveryNotesAndInvoices() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [activeTab, setActiveTab] = useState<'delivery_notes' | 'invoices' | 'bulk_delete'>('delivery_notes');
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNote[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<DeliveryNote | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedTank, setSelectedTank] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [effectivePrice, setEffectivePrice] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteDocType, setDeleteDocType] = useState<'delivery_notes' | 'invoices'>('delivery_notes');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [notesResult, invoicesResult, tanksResult, clientsResult, priceResult] = await Promise.all([
        supabase
          .from('delivery_notes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*, client:client_id(name, email)')
          .order('created_at', { ascending: false }),
        supabase
          .from('inventory_tanks')
          .select('id, tank_name, current_liters')
          .order('tank_name'),
        supabase
          .from('clients')
          .select('id, name, custom_price_per_liter'),
        supabase
          .from('fuel_prices')
          .select('selling_price')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setDeliveryNotes(notesResult.data || []);
      setInvoices(invoicesResult.data || []);
      setTanks(tanksResult.data || []);
      setClients(clientsResult.data || []);

      if (priceResult.data) {
        setCurrentPrice(priceResult.data.selling_price);
        setEffectivePrice(priceResult.data.selling_price);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setFeedback({ type: 'error', message: 'Failed to load data' });
    } finally {
      setLoading(false);
    }
  }

  function handlePrintDeliveryNote(note: DeliveryNote) {
    printDeliveryNote({
      note_number: note.note_number,
      customer_name: note.customer_name,
      vehicle_registration: note.vehicle_registration,
      driver_name: note.driver_name,
      meter_reading_a: note.meter_reading_a,
      meter_reading_b: note.meter_reading_b,
      litres_dispensed: note.litres_dispensed,
      litres_reading: note.litres_reading,
      attendant_name: note.attendant_name,
      created_at: note.created_at,
    });
  }

  function handlePrintInvoice(invoice: Invoice) {
    printInvoice({
      invoice_number: invoice.invoice_number,
      delivery_note_number: invoice.delivery_note_number,
      customer_name: invoice.client?.name || 'N/A',
      liters_sold: invoice.liters_sold,
      selling_price_per_liter: invoice.selling_price_per_liter,
      total_amount: invoice.total_amount,
      status: invoice.status,
      created_at: invoice.invoice_date || invoice.created_at,
    });
  }

  async function handleCreateInvoice() {
    if (!profile || !selectedDeliveryNote || !selectedTank || submitting) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      const litersSold = selectedDeliveryNote.litres_reading || selectedDeliveryNote.litres_dispensed;
      const clientId = selectedDeliveryNote.client_id;

      const { data: inventoryItems } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tank_id', selectedTank)
        .gt('remaining_liters', 0)
        .order('entry_date');

      if (!inventoryItems || inventoryItems.length === 0) {
        setFeedback({ type: 'error', message: 'No inventory available in selected tank' });
        return;
      }

      const totalAvailable = inventoryItems.reduce((sum, item) => sum + item.remaining_liters, 0);
      if (totalAvailable < litersSold) {
        setFeedback({
          type: 'error',
          message: `Insufficient fuel. Only ${totalAvailable.toLocaleString()}L available`,
        });
        return;
      }

      const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc('generate_invoice_number');
      if (invoiceNumberError) throw invoiceNumberError;
      const invoiceNumber = invoiceNumberData as string;

      const invoiceResult = await supabase
        .from('invoices')
        .insert([{
          invoice_number: invoiceNumber,
          delivery_note_number: selectedDeliveryNote.note_number,
          client_id: clientId,
          vehicle_id: null,
          liters_sold: litersSold,
          tank_id: selectedTank,
          selling_price_per_liter: effectivePrice,
          item_description: 'Diesel Fuel',
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: new Date().toISOString().split('T')[0],
          status: 'unsettled',
          created_by: profile.id,
          is_test_data: isTestingMode,
        }])
        .select()
        .single();

      if (invoiceResult.error) throw invoiceResult.error;

      const invoiceData = invoiceResult.data;

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
        .eq('tank_id', selectedTank)
        .gt('remaining_liters', 0);

      const newTankLiters = (updatedItems || []).reduce((sum, item) => sum + item.remaining_liters, 0);

      await supabase
        .from('inventory_tanks')
        .update({ current_liters: newTankLiters })
        .eq('id', selectedTank);

      await supabase
        .from('delivery_notes')
        .update({ has_invoice: true, invoice_id: invoiceData.id })
        .eq('id', selectedDeliveryNote.id);

      setFeedback({ type: 'success', message: 'Invoice created successfully!' });
      setShowInvoiceModal(false);
      setSelectedDeliveryNote(null);
      setSelectedTank('');
      setTimeout(() => {
        loadData();
        setActiveTab('invoices');
      }, 1000);
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      setFeedback({ type: 'error', message: error.message || 'Failed to create invoice' });
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownloadInvoice(invoice: Invoice) {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;

    // Header
    doc.setFontSize(16);
    doc.text('INVOICE', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Invoice #: ${invoice.invoice_number}`, margin, yPos);
    yPos += 5;
    doc.text(`Delivery Note #: ${invoice.delivery_note_number}`, margin, yPos);
    yPos += 5;
    doc.text(`Date: ${format(new Date(invoice.invoice_date || invoice.created_at), 'dd/MM/yyyy')}`, margin, yPos);
    yPos += 8;

    // Client info
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text('Bill To:', margin, yPos);
    yPos += 5;
    if (invoice.client) {
      doc.setFontSize(10);
      doc.text(invoice.client.name, margin, yPos);
      yPos += 5;
      if (invoice.client.email) {
        doc.text(invoice.client.email, margin, yPos);
        yPos += 5;
      }
    }
    yPos += 3;

    // Table header
    doc.setFillColor(200, 200, 200);
    doc.rect(margin, yPos, contentWidth, 6, 'F');
    doc.setFontSize(10);
    doc.text('Description', margin + 2, yPos + 4);
    doc.text('Liters', margin + 100, yPos + 4);
    doc.text('Unit Price', margin + 130, yPos + 4);
    doc.text('Total', margin + 165, yPos + 4);
    yPos += 8;

    // Invoice items
    doc.setFontSize(10);
    doc.text(invoice.item_description || 'Diesel Fuel', margin + 2, yPos);
    doc.text(invoice.liters_sold.toFixed(2), margin + 100, yPos);
    doc.text(`N$${invoice.selling_price_per_liter.toFixed(2)}`, margin + 130, yPos);
    doc.text(`N$${invoice.total_amount.toFixed(2)}`, margin + 165, yPos);
    yPos += 8;

    // Totals
    doc.setDrawColor(0);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    doc.setFontSize(11);
    doc.text('Total Amount:', margin + 100, yPos);
    doc.text(`N$${invoice.total_amount.toFixed(2)}`, margin + 165, yPos);
    yPos += 8;

    // Status
    doc.setFontSize(10);
    doc.text(`Status: ${invoice.status}`, margin, yPos);

    doc.save(`Invoice-${invoice.invoice_number}.pdf`);
  }

  const filteredDeliveryNotes = deliveryNotes.filter((note) =>
    note.note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredInvoices = invoices.filter((inv) =>
    inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.delivery_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    inv.client?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const currentItems = deleteDocType === 'delivery_notes' ? filteredDeliveryNotes : filteredInvoices;
    const allIds = currentItems.map((item) => item.id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  function exitSelectMode() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setFeedback(null);

    try {
      const ids = Array.from(selectedIds);
      let successCount = 0;
      let errorCount = 0;

      for (const id of ids) {
        const rpcName = deleteDocType === 'delivery_notes' ? 'delete_delivery_note' : 'delete_invoice';
        const paramName = deleteDocType === 'delivery_notes' ? 'p_dn_id' : 'p_invoice_id';
        const { error } = await supabase.rpc(rpcName, { [paramName]: id });
        if (error) {
          console.error(`Failed to delete ${id}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (errorCount === 0) {
        setFeedback({ type: 'success', message: `Successfully deleted ${successCount} ${deleteDocType === 'delivery_notes' ? 'delivery note' : 'invoice'}${successCount > 1 ? 's' : ''}` });
      } else {
        setFeedback({ type: 'error', message: `Deleted ${successCount}, failed ${errorCount}` });
      }

      setShowBulkDeleteModal(false);
      exitSelectMode();
      loadData();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error.message || 'Bulk delete failed' });
    } finally {
      setBulkDeleting(false);
    }
  }

  if (loading) return <OshaliLoader variant="inline" />;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`p-4 rounded-xl border ${
            feedback.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <p className="font-medium">{feedback.message}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => { setActiveTab('delivery_notes'); setSelectedIds(new Set()); }}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'delivery_notes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 mr-2 inline-block" />
          Delivery Notes ({deliveryNotes.length})
        </button>
        <button
          onClick={() => { setActiveTab('invoices'); setSelectedIds(new Set()); }}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'invoices'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 mr-2 inline-block" />
          Invoices ({invoices.length})
        </button>
        <button
          onClick={() => { setActiveTab('bulk_delete'); setSelectedIds(new Set()); }}
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${
            activeTab === 'bulk_delete'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <Trash2 className="w-4 h-4 mr-2 inline-block" />
          Bulk Delete
        </button>
      </div>

      {/* Search (for Delivery Notes and Invoices tabs only) */}
      {activeTab !== 'bulk_delete' && (
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Delivery Notes Tab */}
      {activeTab === 'delivery_notes' && (
        <div className="space-y-4">
          {filteredDeliveryNotes.length === 0 ? (
            <Card>
              <p className="text-center text-gray-500 py-8">No delivery notes found</p>
            </Card>
          ) : (
            filteredDeliveryNotes.map((note) => (
              <Card key={note.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-lg text-gray-900">{note.note_number}</p>
                    <p className="text-gray-600">{note.customer_name}</p>
                    <p className="text-sm text-gray-500">Vehicle: {note.vehicle_registration}</p>
                    <p className="text-sm text-gray-500">Driver: {note.driver_name}</p>
                    <p className="text-sm text-gray-500">Liters Dispensed: {note.litres_dispensed.toFixed(2)}L</p>
                    <p className="text-sm text-gray-500">
                      Created: {format(new Date(note.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                    {note.has_invoice && (
                      <p className="text-sm text-green-600 font-medium mt-2">Invoice Created</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handlePrintDeliveryNote(note)}
                      className="flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </Button>
                    {!note.has_invoice && (
                      <Button
                        variant="primary"
                        onClick={() => {
                          setSelectedDeliveryNote(note);
                          setShowInvoiceModal(true);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Invoice
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {filteredInvoices.length === 0 ? (
            <Card>
              <p className="text-center text-gray-500 py-8">No invoices found</p>
            </Card>
          ) : (
            filteredInvoices.map((invoice) => (
              <Card key={invoice.id}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-lg text-gray-900">{invoice.invoice_number}</p>
                    <p className="text-gray-600">{invoice.client?.name || 'N/A'}</p>
                    <p className="text-sm text-gray-500">Delivery Note: {invoice.delivery_note_number}</p>
                    <p className="text-sm text-gray-500">
                      Liters: {invoice.liters_sold.toFixed(2)}L @ N${invoice.selling_price_per_liter.toFixed(2)}/L
                    </p>
                    <p className="text-lg font-semibold text-gray-900 mt-2">
                      Total: N${invoice.total_amount.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">
                      Status: <span className="font-medium capitalize">{invoice.status}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                      Date: {format(new Date(invoice.invoice_date || invoice.created_at), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelectedInvoice(invoice);
                        setShowViewModal(true);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handlePrintInvoice(invoice)}
                      className="flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleDownloadInvoice(invoice)}
                      className="flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Bulk Delete Tab */}
      {activeTab === 'bulk_delete' && (
        <div className="space-y-4">
          {/* Doc type sub-filter */}
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => { setDeleteDocType('delivery_notes'); setSelectedIds(new Set()); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  deleteDocType === 'delivery_notes'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Delivery Notes ({deliveryNotes.length})
              </button>
              <button
                onClick={() => { setDeleteDocType('invoices'); setSelectedIds(new Set()); }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  deleteDocType === 'invoices'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Invoices ({invoices.length})
              </button>
            </div>
          </div>

          {/* Search within bulk delete */}
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${deleteDocType === 'delivery_notes' ? 'delivery notes' : 'invoices'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Selection toolbar */}
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {(() => {
                  const currentItems = deleteDocType === 'delivery_notes' ? filteredDeliveryNotes : filteredInvoices;
                  const allSelected = currentItems.length > 0 && currentItems.every((item) => selectedIds.has(item.id));
                  return allSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  );
                })()}
                Select All
              </button>
              <span className="text-sm text-gray-500">
                {selectedIds.size} of {(deleteDocType === 'delivery_notes' ? filteredDeliveryNotes : filteredInvoices).length} selected
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-2 !text-red-600 !border-red-300 hover:!bg-red-50 disabled:!text-gray-400 disabled:!border-gray-200"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedIds.size})
            </Button>
          </div>

          {/* Document list with checkboxes */}
          {deleteDocType === 'delivery_notes' ? (
            <div className="space-y-2">
              {filteredDeliveryNotes.length === 0 ? (
                <Card>
                  <p className="text-center text-gray-500 py-8">No delivery notes found</p>
                </Card>
              ) : (
                filteredDeliveryNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => toggleSelection(note.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.has(note.id)
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    {selectedIds.has(note.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{note.note_number}</p>
                        {note.has_invoice && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                            Invoiced
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">{note.customer_name} - {note.vehicle_registration}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-900">{note.litres_dispensed.toFixed(1)}L</p>
                      <p className="text-xs text-gray-500">{format(new Date(note.created_at), 'dd/MM/yyyy')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredInvoices.length === 0 ? (
                <Card>
                  <p className="text-center text-gray-500 py-8">No invoices found</p>
                </Card>
              ) : (
                filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    onClick={() => toggleSelection(invoice.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedIds.has(invoice.id)
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    {selectedIds.has(invoice.id) ? (
                      <CheckSquare className="w-5 h-5 text-blue-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{invoice.invoice_number}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          invoice.status === 'settled'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {invoice.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{invoice.client?.name || 'N/A'} - {invoice.delivery_note_number}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-gray-900">N${invoice.total_amount.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">{format(new Date(invoice.invoice_date || invoice.created_at), 'dd/MM/yyyy')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {deleteDocType === 'invoices' && selectedIds.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                Deleting invoices will restore sold fuel back to inventory and update tank levels accordingly.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create Invoice Modal */}
      {showInvoiceModal && selectedDeliveryNote && (
        <Modal isOpen onClose={() => setShowInvoiceModal(false)} title="Create Invoice">
          <div className="relative">
            {submitting && <OshaliLoader variant="overlay" message="Creating invoice..." />}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Delivery Note</p>
              <p className="text-lg font-semibold">{selectedDeliveryNote.note_number}</p>
              <p className="text-sm text-gray-600">{selectedDeliveryNote.customer_name}</p>
              <p className="text-sm text-gray-600">
                Liters: {(selectedDeliveryNote.litres_reading || selectedDeliveryNote.litres_dispensed).toFixed(2)}L
              </p>
            </div>

            <Select
              label="Tank"
              value={selectedTank}
              onChange={(e) => setSelectedTank(e.target.value)}
              required
            >
              <option value="">Select Tank</option>
              {tanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  {tank.tank_name} ({tank.current_liters.toFixed(2)}L available)
                </option>
              ))}
            </Select>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Selling Price per Liter</p>
              <p className="text-lg font-semibold">N${effectivePrice.toFixed(2)}</p>
            </div>

            {selectedTank && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  Total Invoice Amount:
                  <span className="ml-2 font-bold">
                    N$
                    {(
                      (selectedDeliveryNote.litres_reading || selectedDeliveryNote.litres_dispensed) *
                      effectivePrice
                    ).toFixed(2)}
                  </span>
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowInvoiceModal(false);
                  setSelectedDeliveryNote(null);
                  setSelectedTank('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateInvoice}
                disabled={!selectedTank || submitting}
              >
                {submitting ? 'Creating...' : 'Create Invoice'}
              </Button>
            </div>
          </div>
          </div>
        </Modal>
      )}

      {/* View Invoice Modal */}
      {showViewModal && selectedInvoice && (
        <Modal isOpen onClose={() => setShowViewModal(false)} title="Invoice Details">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Invoice Number</p>
              <p className="text-lg font-semibold">{selectedInvoice.invoice_number}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Delivery Note</p>
              <p className="text-lg font-semibold">{selectedInvoice.delivery_note_number}</p>
            </div>
            {selectedInvoice.client && (
              <div>
                <p className="text-sm text-gray-600">Customer</p>
                <p className="text-lg font-semibold">{selectedInvoice.client.name}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600">Liters Sold</p>
              <p className="text-lg font-semibold">{selectedInvoice.liters_sold.toFixed(2)}L</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Unit Price</p>
              <p className="text-lg font-semibold">N${selectedInvoice.selling_price_per_liter.toFixed(2)}</p>
            </div>
            <div className="bg-gray-100 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900">N${selectedInvoice.total_amount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="text-lg font-semibold capitalize">{selectedInvoice.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Invoice Date</p>
              <p className="text-lg font-semibold">{format(new Date(selectedInvoice.invoice_date || selectedInvoice.created_at), 'dd/MM/yyyy')}</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="secondary" onClick={() => setShowViewModal(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePrintInvoice(selectedInvoice)}
                className="flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  handleDownloadInvoice(selectedInvoice);
                  setShowViewModal(false);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <Modal isOpen onClose={() => setShowBulkDeleteModal(false)} title="Confirm Bulk Delete">
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-medium text-red-800">
                You are about to delete {selectedIds.size} {deleteDocType === 'delivery_notes' ? 'delivery note' : 'invoice'}{selectedIds.size > 1 ? 's' : ''}. This action cannot be undone.
              </p>
              {deleteDocType === 'invoices' && (
                <p className="text-xs text-red-600 mt-2">
                  Deleting invoices will restore sold fuel back to inventory and update tank levels.
                </p>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1">
              {Array.from(selectedIds).map((id) => {
                if (deleteDocType === 'delivery_notes') {
                  const note = deliveryNotes.find((n) => n.id === id);
                  return note ? (
                    <div key={id} className="flex items-center justify-between text-sm py-1.5 px-2 bg-gray-50 rounded">
                      <span className="font-medium">{note.note_number}</span>
                      <span className="text-gray-500">{note.customer_name}</span>
                    </div>
                  ) : null;
                } else {
                  const inv = invoices.find((i) => i.id === id);
                  return inv ? (
                    <div key={id} className="flex items-center justify-between text-sm py-1.5 px-2 bg-gray-50 rounded">
                      <span className="font-medium">{inv.invoice_number}</span>
                      <span className="text-gray-500">{formatCurrency(inv.total_amount)}</span>
                    </div>
                  ) : null;
                }
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 !bg-red-600 hover:!bg-red-700 !text-white"
              >
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Item${selectedIds.size > 1 ? 's' : ''}`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
