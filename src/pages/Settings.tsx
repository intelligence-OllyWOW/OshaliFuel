import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Save, RefreshCw, FlaskConical, Trash2, Lock, Unlock, FileText, Search, ChevronRight, Gauge } from 'lucide-react';

interface SystemSettings {
  id: string;
  tank_low_level_threshold: number;
  tank_high_level_threshold: number;
  tank_critical_level_threshold: number;
  testing_mode_enabled: boolean;
  company_name:        string;
  company_address:     string;
  company_tel:         string;
  company_vat:         string;
  company_email:       string;
  invoice_footer_text: string;
  vat_percentage:      number;
  vat_label:           string;
  invoice_title:       string;
}

type DocumentType = 'PR' | 'PO' | 'GR' | 'INVOICE' | 'DN';
type SettingsTab = 'tank-alerts' | 'test-mode' | 'doc-management' | 'invoice-settings';

interface DocumentOption {
  id: string;
  number: string;
  date: string;
  details: string;
}

interface DeletionImpact {
  document_number: string;
  will_delete: Record<string, number>;
  will_update: Record<string, string>;
  will_reverse: Record<string, number | string>;
  warnings: string[];
}

export default function Settings() {
  const { profile } = useAuth();
  const { refresh: refreshTestingMode } = useTestingMode();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showExitTestingModal, setShowExitTestingModal] = useState(false);
  const [deletingTestData, setDeletingTestData] = useState(false);
  const [testDataStats, setTestDataStats] = useState<Record<string, number> | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = React.useRef<number | null>(null);
  const holdStartTimeRef = React.useRef<number | null>(null);

  const canEdit = profile?.role === 'super_admin' || profile?.role === 'general_manager';
  const isSuperAdmin = profile?.role === 'super_admin';

  const [activeTab, setActiveTab] = useState<SettingsTab>('tank-alerts');
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('PR');
  const [documentSearch, setDocumentSearch] = useState('');
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentOption | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
      } else {
        setSettings({
          id: '',
          tank_low_level_threshold: 20,
          tank_high_level_threshold: 90,
          tank_critical_level_threshold: 10,
          testing_mode_enabled: false,
          company_name:        'Oshali Fuel',
          company_address:     'Windhoek, Namibia',
          company_tel:         '',
          company_vat:         '',
          company_email:       '',
          invoice_footer_text: 'Thank you for your business! Goods once sold are not returnable. E&OE.',
          vat_percentage:      15,
          vat_label:           'Incl VAT (15%)',
          invoice_title:       'INVOICE',
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTestDataStats() {
    const tables = [
      'purchase_requisitions',
      'purchase_orders',
      'goods_received',
      'inventory_items',
      'invoices',
      'invoice_line_items',
      'clients',
      'client_vehicles',
      'notifications',
    ];

    const stats: Record<string, number> = {};
    for (const table of tables) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('is_test_data', true);
      stats[table] = count || 0;
    }
    setTestDataStats(stats);
  }

  async function handleSave() {
    if (!settings || !canEdit) return;

    setSaving(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          tank_low_level_threshold: settings.tank_low_level_threshold,
          tank_high_level_threshold: settings.tank_high_level_threshold,
          tank_critical_level_threshold: settings.tank_critical_level_threshold,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id,
        })
        .eq('id', settings.id);

      if (error) throw error;

      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Error saving settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleTestingMode() {
    if (!settings || !canEdit) return;

    if (settings.testing_mode_enabled) {
      await loadTestDataStats();
      setShowExitTestingModal(true);
    }
  }

  function handleHoldStart() {
    if (settings?.testing_mode_enabled || saving) return;

    setIsHolding(true);
    holdStartTimeRef.current = Date.now();

    const updateProgress = () => {
      if (holdStartTimeRef.current) {
        const elapsed = Date.now() - holdStartTimeRef.current;
        const progress = Math.min((elapsed / 2000) * 100, 100);
        setHoldProgress(progress);

        if (progress >= 100) {
          handleHoldComplete();
        } else {
          holdTimerRef.current = requestAnimationFrame(updateProgress);
        }
      }
    };

    holdTimerRef.current = requestAnimationFrame(updateProgress);
  }

  function handleHoldEnd() {
    setIsHolding(false);
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartTimeRef.current = null;
    setHoldProgress(0);
  }

  async function handleHoldComplete() {
    if (holdTimerRef.current) {
      cancelAnimationFrame(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
    await enableTestingMode();
  }

  React.useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        cancelAnimationFrame(holdTimerRef.current);
      }
    };
  }, []);

  async function enableTestingMode() {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          testing_mode_enabled: true,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id,
        })
        .eq('id', settings.id);

      if (error) throw error;

      setSettings({ ...settings, testing_mode_enabled: true });
      await refreshTestingMode();
      setMessage('Testing mode enabled - all new data will be marked as test data');
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Error enabling testing mode:', error);
      setMessage('Error enabling testing mode');
    } finally {
      setSaving(false);
    }
  }

  async function handleExitTestingMode(deleteData: boolean) {
    if (!settings) return;

    setDeletingTestData(true);
    try {
      if (deleteData) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-test-data`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        setMessage(`Testing mode disabled - ${result.message}`);
      } else {
        const { error } = await supabase
          .from('system_settings')
          .update({
            testing_mode_enabled: false,
            updated_at: new Date().toISOString(),
            updated_by: profile?.id,
          })
          .eq('id', settings.id);

        if (error) throw error;
        setMessage('Testing mode disabled - test data preserved');
      }

      setSettings({ ...settings, testing_mode_enabled: false });
      await refreshTestingMode();
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Error exiting testing mode:', error);
      setMessage('Error exiting testing mode');
    } finally {
      setDeletingTestData(false);
      setShowExitTestingModal(false);
    }
  }

  function updateThreshold(field: keyof SystemSettings, value: string) {
    if (!settings) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) return;

    setSettings({
      ...settings,
      [field]: numValue,
    });
  }

  const [savingPrint, setSavingPrint] = useState(false);
  const [printMessage, setPrintMessage] = useState('');

  async function handleSavePrintConfig() {
    if (!settings || !canEdit) return;
    setSavingPrint(true);
    setPrintMessage('');
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          company_name:        settings.company_name,
          company_address:     settings.company_address,
          company_tel:         settings.company_tel,
          company_vat:         settings.company_vat,
          company_email:       settings.company_email,
          invoice_footer_text: settings.invoice_footer_text,
          vat_percentage:      settings.vat_percentage,
          vat_label:           settings.vat_label,
          invoice_title:       settings.invoice_title,
        })
        .eq('id', settings.id);
      if (error) throw error;
      setPrintMessage('Invoice settings saved successfully');
      setTimeout(() => setPrintMessage(''), 3000);
    } catch (error) {
      console.error('Error saving invoice settings:', error);
      setPrintMessage('Error saving invoice settings');
    } finally {
      setSavingPrint(false);
    }
  }

  const totalTestRecords = testDataStats
    ? Object.values(testDataStats).reduce((a, b) => a + b, 0)
    : 0;

  const documentTypeLabels: Record<DocumentType, string> = {
    PR: 'Purchase Requisition',
    PO: 'Purchase Order',
    GR: 'Goods Received',
    INVOICE: 'Invoice',
    DN: 'Delivery Note',
  };

  async function searchDocuments() {
    if (!documentSearch.trim()) {
      setDocuments([]);
      return;
    }

    setLoadingDocuments(true);
    try {
      let results: DocumentOption[] = [];
      const searchTerm = `%${documentSearch}%`;

      switch (selectedDocType) {
        case 'PR': {
          const { data } = await supabase
            .from('purchase_requisitions')
            .select('id, pr_number, requisition_date, liters_requested, status')
            .ilike('pr_number', searchTerm)
            .order('created_at', { ascending: false })
            .limit(10);
          results = (data || []).map(d => ({
            id: d.id,
            number: d.pr_number,
            date: d.requisition_date,
            details: `${Number(d.liters_requested).toLocaleString()} L - ${d.status}`,
          }));
          break;
        }
        case 'PO': {
          const { data } = await supabase
            .from('purchase_orders')
            .select('id, po_number, created_at, liters_ordered, status, supplier_name')
            .ilike('po_number', searchTerm)
            .order('created_at', { ascending: false })
            .limit(10);
          results = (data || []).map(d => ({
            id: d.id,
            number: d.po_number,
            date: d.created_at?.split('T')[0] || '',
            details: `${Number(d.liters_ordered).toLocaleString()} L - ${d.supplier_name} - ${d.status}`,
          }));
          break;
        }
        case 'GR': {
          const { data } = await supabase
            .from('goods_received')
            .select('id, gr_number, receipt_date, liters_received, status')
            .ilike('gr_number', searchTerm)
            .order('created_at', { ascending: false })
            .limit(10);
          results = (data || []).map(d => ({
            id: d.id,
            number: d.gr_number,
            date: d.receipt_date,
            details: `${Number(d.liters_received).toLocaleString()} L - ${d.status}`,
          }));
          break;
        }
        case 'INVOICE': {
          const { data } = await supabase
            .from('invoices')
            .select('id, invoice_number, invoice_date, liters_sold, status, total_amount')
            .ilike('invoice_number', searchTerm)
            .order('created_at', { ascending: false })
            .limit(10);
          results = (data || []).map(d => ({
            id: d.id,
            number: d.invoice_number,
            date: d.invoice_date || '',
            details: `${Number(d.liters_sold).toLocaleString()} L - N$${Number(d.total_amount).toLocaleString()} - ${d.status}`,
          }));
          break;
        }
        case 'DN': {
          const { data } = await supabase
            .from('delivery_notes')
            .select('id, note_number, created_at, litres_dispensed, customer_name, has_invoice')
            .ilike('note_number', searchTerm)
            .order('created_at', { ascending: false })
            .limit(10);
          results = (data || []).map(d => ({
            id: d.id,
            number: d.note_number,
            date: d.created_at?.split('T')[0] || '',
            details: `${Number(d.litres_dispensed).toLocaleString()} L - ${d.customer_name}${d.has_invoice ? ' (Has Invoice)' : ''}`,
          }));
          break;
        }
      }
      setDocuments(results);
    } catch (error) {
      console.error('Error searching documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  }

  async function handleSelectDocument(doc: DocumentOption) {
    setSelectedDocument(doc);
    setDeletionImpact(null);

    try {
      const { data, error } = await supabase.rpc('get_deletion_impact', {
        p_doc_type: selectedDocType,
        p_doc_id: doc.id,
      });

      if (error) throw error;
      setDeletionImpact(data as DeletionImpact);
      setShowDeleteModal(true);
    } catch (error) {
      console.error('Error getting deletion impact:', error);
      setDeleteMessage('Error analyzing deletion impact');
    }
  }

  async function handleDeleteDocument() {
    if (!selectedDocument) return;

    setDeleting(true);
    setDeleteMessage('');

    try {
      let functionName = '';
      switch (selectedDocType) {
        case 'PR':
          functionName = 'delete_purchase_requisition';
          break;
        case 'PO':
          functionName = 'delete_purchase_order';
          break;
        case 'GR':
          functionName = 'delete_goods_received';
          break;
        case 'INVOICE':
          functionName = 'delete_invoice';
          break;
        case 'DN':
          functionName = 'delete_delivery_note';
          break;
      }

      const paramName = selectedDocType === 'PR' ? 'p_pr_id' :
                        selectedDocType === 'PO' ? 'p_po_id' :
                        selectedDocType === 'GR' ? 'p_gr_id' :
                        selectedDocType === 'INVOICE' ? 'p_invoice_id' : 'p_dn_id';

      const { data, error } = await supabase.rpc(functionName, {
        [paramName]: selectedDocument.id,
      });

      if (error) throw error;

      const result = data as { success: boolean };
      if (result.success) {
        setDeleteMessage(`Successfully deleted ${documentTypeLabels[selectedDocType]} ${selectedDocument.number}`);
        setDocuments(documents.filter(d => d.id !== selectedDocument.id));
        setShowDeleteModal(false);
        setSelectedDocument(null);
        setDeletionImpact(null);
        setTimeout(() => setDeleteMessage(''), 5000);
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      setDeleteMessage(`Error deleting document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  }

  function formatImpactKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  const tabs = [
    { id: 'tank-alerts' as SettingsTab, label: 'Tank Alerts', icon: Gauge, show: true },
    { id: 'test-mode' as SettingsTab, label: 'Test Mode', icon: FlaskConical, show: canEdit },
    { id: 'invoice-settings' as SettingsTab, label: 'Invoice & Receipt', icon: FileText, show: canEdit },
    { id: 'doc-management' as SettingsTab, label: 'Document Management', icon: Search, show: isSuperAdmin },
  ].filter(tab => tab.show);

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-light mb-2">System Settings</h1>
        <p className="text-sm font-light text-gray-500">
          Configure system-wide settings and preferences
        </p>
      </div>

      <div className="max-w-3xl">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'tank-alerts' && (
          <Card>
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <Gauge className="w-5 h-5 text-orange-600" strokeWidth={1.5} />
                <h2 className="text-lg font-light">Tank Alert Thresholds</h2>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">
                    Critical Level Threshold (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={settings?.tank_critical_level_threshold || 10}
                    onChange={(e) => updateThreshold('tank_critical_level_threshold', e.target.value)}
                    disabled={!canEdit}
                  />
                  <p className="text-xs font-light text-gray-500 mt-1">
                    Show critical alert when tank level falls below this percentage (Default: 10%)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">
                    Low Level Threshold (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={settings?.tank_low_level_threshold || 20}
                    onChange={(e) => updateThreshold('tank_low_level_threshold', e.target.value)}
                    disabled={!canEdit}
                  />
                  <p className="text-xs font-light text-gray-500 mt-1">
                    Show low level warning when tank level falls below this percentage (Default: 20%)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">
                    High Level Threshold (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={settings?.tank_high_level_threshold || 90}
                    onChange={(e) => updateThreshold('tank_high_level_threshold', e.target.value)}
                    disabled={!canEdit}
                  />
                  <p className="text-xs font-light text-gray-500 mt-1">
                    Show high level warning when tank level exceeds this percentage (Default: 90%)
                  </p>
                </div>

                <div className="bg-blue-50 rounded-xl p-4">
                  <h3 className="text-sm font-light text-blue-900 mb-2">Preview</h3>
                  <div className="space-y-2 text-xs font-light text-blue-800">
                    <div className="flex items-center justify-between">
                      <span>0% - {settings?.tank_critical_level_threshold}%</span>
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Critical</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{settings?.tank_critical_level_threshold}% - {settings?.tank_low_level_threshold}%</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Low</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{settings?.tank_low_level_threshold}% - {settings?.tank_high_level_threshold}%</span>
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Normal</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{settings?.tank_high_level_threshold}% - 100%</span>
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">High</span>
                    </div>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`p-3 rounded-xl text-sm font-light ${
                  message.includes('Error')
                    ? 'bg-red-50 text-red-700'
                    : 'bg-green-50 text-green-700'
                }`}>
                  {message}
                </div>
              )}

              {canEdit && (
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" strokeWidth={1.5} />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={loadSettings} disabled={saving}>
                    Reset
                  </Button>
                </div>
              )}

              {!canEdit && (
                <div className="p-3 bg-gray-50 rounded-xl text-sm font-light text-gray-600">
                  You don't have permission to modify system settings
                </div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'invoice-settings' && canEdit && (
          <Card>
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <FileText className="w-5 h-5 text-blue-600" strokeWidth={1.5} />
                <h2 className="text-lg font-light">Invoice &amp; Receipt Settings</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">Company Name</label>
                  <Input
                    type="text"
                    value={settings?.company_name || ''}
                    onChange={(e) => settings && setSettings({ ...settings, company_name: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">Company Address</label>
                  <Input
                    type="text"
                    value={settings?.company_address || ''}
                    onChange={(e) => settings && setSettings({ ...settings, company_address: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">Company Tel</label>
                  <Input
                    type="text"
                    value={settings?.company_tel || ''}
                    onChange={(e) => settings && setSettings({ ...settings, company_tel: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">Company VAT Number</label>
                  <Input
                    type="text"
                    value={settings?.company_vat || ''}
                    onChange={(e) => settings && setSettings({ ...settings, company_vat: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">VAT Percentage (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={settings?.vat_percentage ?? 15}
                    onChange={(e) => settings && setSettings({ ...settings, vat_percentage: parseFloat(e.target.value) || 0 })}
                    disabled={!canEdit}
                  />
                  <p className="text-xs font-light text-gray-500 mt-1">Used to calculate VAT on invoices (Default: 15%)</p>
                </div>
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">Invoice Footer Text</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-light focus:outline-none focus:ring-1 focus:ring-black focus:border-black resize-none disabled:bg-gray-50 disabled:text-gray-500"
                    rows={3}
                    value={settings?.invoice_footer_text || ''}
                    onChange={(e) => settings && setSettings({ ...settings, invoice_footer_text: e.target.value })}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              {printMessage && (
                <div className={`p-3 rounded-xl text-sm font-light ${
                  printMessage.includes('Error')
                    ? 'bg-red-50 text-red-700'
                    : 'bg-green-50 text-green-700'
                }`}>
                  {printMessage}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <Button onClick={handleSavePrintConfig} disabled={savingPrint}>
                  {savingPrint ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" strokeWidth={1.5} />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button variant="secondary" onClick={loadSettings} disabled={savingPrint}>
                  Reset
                </Button>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'test-mode' && canEdit && (
          <Card>
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <FlaskConical className="w-5 h-5 text-cyan-600" strokeWidth={1.5} />
                <div>
                  <h2 className="text-lg font-light">Testing Mode</h2>
                  <p className="text-xs text-gray-500">Create test data without affecting production records</p>
                </div>
              </div>

              <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                <p className="text-sm text-cyan-800">
                  When testing mode is enabled, all new records (PRs, POs, GRs, Invoices, Clients, etc.)
                  will be marked as test data. You can delete all test data when exiting testing mode.
                </p>
              </div>

              <div className={`p-4 rounded-xl border-2 transition-all ${
                settings?.testing_mode_enabled
                  ? 'bg-cyan-50 border-cyan-300'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-3 h-3 rounded-full ${
                    settings?.testing_mode_enabled
                      ? 'bg-cyan-500 animate-pulse'
                      : 'bg-gray-400'
                  }`} />
                  <p className="font-medium text-sm">
                    {settings?.testing_mode_enabled ? 'Testing Mode Active' : 'Testing Mode Inactive'}
                  </p>
                </div>

                {settings?.testing_mode_enabled ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleToggleTestingMode}
                    disabled={saving}
                    className="w-full h-10"
                  >
                    <Unlock className="w-4 h-4" strokeWidth={1.5} />
                    Exit Testing Mode
                  </Button>
                ) : (
                  <button
                    onMouseDown={handleHoldStart}
                    onMouseUp={handleHoldEnd}
                    onMouseLeave={handleHoldEnd}
                    onTouchStart={handleHoldStart}
                    onTouchEnd={handleHoldEnd}
                    disabled={saving}
                    className="relative w-full h-10 rounded-lg font-light overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed select-none"
                  >
                    <div
                      className="absolute inset-0 bg-cyan-500 transition-all duration-100"
                      style={{ width: `${holdProgress}%` }}
                    />
                    <div className="absolute inset-0 bg-gray-200" />
                    <div className="relative z-10 flex items-center justify-center gap-2 h-full text-gray-700">
                      <Lock className="w-4 h-4" strokeWidth={1.5} />
                      <span className="text-sm">
                        {isHolding ? 'Hold to confirm...' : 'Hold to Enable Testing Mode'}
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {message && (
                <div className={`p-3 rounded-xl text-sm font-light ${
                  message.includes('Error')
                    ? 'bg-red-50 text-red-700'
                    : 'bg-green-50 text-green-700'
                }`}>
                  {message}
                </div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'doc-management' && isSuperAdmin && (
          <Card>
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <FileText className="w-5 h-5 text-red-600" strokeWidth={1.5} />
                <div>
                  <h2 className="text-lg font-light">Document Management</h2>
                  <p className="text-xs text-gray-500">Delete documents with full cascade and inventory restoration</p>
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div className="text-sm text-red-800">
                    <p className="font-medium mb-1">Danger Zone</p>
                    <p className="text-xs">
                      Deleting documents is permanent and cannot be undone. Related documents will be cascade deleted,
                      and inventory levels will be adjusted accordingly.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">
                    Document Type
                  </label>
                  <Select
                    value={selectedDocType}
                    onChange={(e) => {
                      setSelectedDocType(e.target.value as DocumentType);
                      setDocuments([]);
                      setDocumentSearch('');
                    }}
                  >
                    <option value="PR">Purchase Requisition (PR)</option>
                    <option value="PO">Purchase Order (PO)</option>
                    <option value="GR">Goods Received (GR)</option>
                    <option value="INVOICE">Invoice</option>
                    <option value="DN">Delivery Note</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-light text-gray-700 mb-2">
                    Search {documentTypeLabels[selectedDocType]}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={`Enter ${selectedDocType} number...`}
                      value={documentSearch}
                      onChange={(e) => setDocumentSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchDocuments()}
                    />
                    <Button
                      onClick={searchDocuments}
                      disabled={loadingDocuments || !documentSearch.trim()}
                      className="flex-shrink-0"
                    >
                      {loadingDocuments ? (
                        <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                      ) : (
                        <Search className="w-4 h-4" strokeWidth={1.5} />
                      )}
                    </Button>
                  </div>
                </div>

                {documents.length > 0 && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                      <p className="text-xs font-medium text-gray-700">
                        {documents.length} result{documents.length !== 1 ? 's' : ''} found
                      </p>
                    </div>
                    <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {documents.map(doc => (
                        <button
                          key={doc.id}
                          onClick={() => handleSelectDocument(doc)}
                          className="w-full px-4 py-3 text-left hover:bg-red-50 transition-colors flex items-center justify-between group"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{doc.number}</p>
                            <p className="text-xs text-gray-500">{doc.date} - {doc.details}</p>
                          </div>
                          <div className="flex items-center gap-2 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs">Delete</span>
                            <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {deleteMessage && (
                  <div className={`p-3 rounded-xl text-sm font-light ${
                    deleteMessage.includes('Error')
                      ? 'bg-red-50 text-red-700'
                      : 'bg-green-50 text-green-700'
                  }`}>
                    {deleteMessage}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => !deleting && setShowDeleteModal(false)}
        title={`Delete ${documentTypeLabels[selectedDocType]}`}
      >
        <div className="space-y-4">
          {selectedDocument && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-900">{selectedDocument.number}</p>
              <p className="text-xs text-gray-500 mt-1">{selectedDocument.date} - {selectedDocument.details}</p>
            </div>
          )}

          {deletionImpact && (
            <div className="space-y-4">
              {Object.keys(deletionImpact.will_delete).length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-red-900 mb-2 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    Will be permanently deleted
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(deletionImpact.will_delete).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs text-red-800">
                        <span>{formatImpactKey(key)}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(deletionImpact.will_update).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-amber-900 mb-2 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
                    Will be updated
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(deletionImpact.will_update).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs text-amber-800">
                        <span>{formatImpactKey(key)}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(deletionImpact.will_reverse).length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
                    Inventory / Tank changes
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(deletionImpact.will_reverse).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-xs text-blue-800">
                        <span>{formatImpactKey(key)}</span>
                        <span className="font-medium">
                          {typeof value === 'number' ? `${Number(value).toLocaleString()} L` : value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {deletionImpact.warnings && deletionImpact.warnings.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <h4 className="text-sm font-medium text-orange-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
                    Warnings
                  </h4>
                  <ul className="space-y-1 text-xs text-orange-800 list-disc list-inside">
                    {deletionImpact.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteDocument}
              disabled={deleting}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Confirm Delete
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showExitTestingModal}
        onClose={() => !deletingTestData && setShowExitTestingModal(false)}
        title="Exit Testing Mode"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            You are about to exit testing mode. What would you like to do with the test data?
          </p>

          {testDataStats && totalTestRecords > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Test Data Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(testDataStats)
                  .filter(([, count]) => count > 0)
                  .map(([table, count]) => (
                    <div key={table} className="flex justify-between">
                      <span className="text-gray-600">{table.replace(/_/g, ' ')}:</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm font-medium">
                <span>Total records:</span>
                <span>{totalTestRecords}</span>
              </div>
            </div>
          )}

          {totalTestRecords === 0 && (
            <div className="bg-green-50 rounded-xl p-4 text-sm text-green-700">
              No test data was created during this testing session.
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => handleExitTestingMode(false)}
              disabled={deletingTestData}
              className="flex-1"
            >
              Keep Test Data
            </Button>
            {totalTestRecords > 0 && (
              <Button
                onClick={() => handleExitTestingMode(true)}
                disabled={deletingTestData}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {deletingTestData ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    Delete Test Data
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
