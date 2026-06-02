import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import { useTestingMode } from '../contexts/TestingModeContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { Plus, Eye, Download, CheckCircle, Upload, FileText as FileIcon, Package, Trash2, Split, MoreVertical, XCircle, CreditCard as Edit3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, generatePONumber } from '../lib/utils';
import { format } from 'date-fns';
import type { Database } from '../lib/database.types';

type PR = Database['public']['Tables']['purchase_requisitions']['Row'];
type PO = Database['public']['Tables']['purchase_orders']['Row'];
type GR = Database['public']['Tables']['goods_received']['Row'];
type Tank = Database['public']['Tables']['inventory_tanks']['Row'];
type Supplier = Database['public']['Tables']['suppliers']['Row'];

export default function Procurement() {
  const { profile } = useAuth();
  const { isTestingMode } = useTestingMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'pr' | 'po' | 'gr'>(
    (searchParams.get('tab') as 'pr' | 'po' | 'gr') || 'pr'
  );
  const [prs, setPrs] = useState<PR[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [grs, setGrs] = useState<GR[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPRModal, setShowPRModal] = useState(false);
  const [showViewPRModal, setShowViewPRModal] = useState(false);
  const [showViewPOModal, setShowViewPOModal] = useState(false);
  const [showPOModal, setShowPOModal] = useState(false);
  const [showGRModal, setShowGRModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [selectedPR, setSelectedPR] = useState<PR | null>(null);
  const [selectedPO, setSelectedPO] = useState<PO | null>(null);
  const [selectedGR, setSelectedGR] = useState<GR | null>(null);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [selectedTankId, setSelectedTankId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [prCreatorName, setPrCreatorName] = useState<string>('');
  const [poCreatorName, setPoCreatorName] = useState<string>('');
  const [tankAllocations, setTankAllocations] = useState<{ tankId: string; liters: number }[]>([]);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [useNewSupplier, setUseNewSupplier] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [poActionMenu, setPoActionMenu] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadTanks();
    loadSuppliers();
  }, [activeTab]);

  useEffect(() => {
    function handleClickOutside() { setPoActionMenu(null); }
    if (poActionMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [poActionMenu]);

  async function loadTanks() {
    try {
      const { data } = await supabase
        .from('inventory_tanks')
        .select('*')
        .order('tank_name');

      setTanks(data || []);
    } catch (error) {
      console.error('Error loading tanks:', error);
    }
  }

  async function loadSuppliers() {
    try {
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');

      setSuppliers(data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'pr') {
        const { data } = await supabase
          .from('purchase_requisitions')
          .select('*')
          .order('created_at', { ascending: false });
        setPrs(data || []);
      } else if (activeTab === 'po') {
        const { data } = await supabase
          .from('purchase_orders')
          .select('*')
          .order('created_at', { ascending: false });
        setPos(data || []);
      } else {
        const { data } = await supabase
          .from('goods_received')
          .select('*')
          .order('created_at', { ascending: false });
        setGrs(data || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleViewPR(pr: PR) {
    setSelectedPR(pr);
    setShowViewPRModal(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', pr.created_by)
      .maybeSingle();

    setPrCreatorName(profile?.full_name || 'Unknown');
  }

  async function handleViewPO(po: PO) {
    setSelectedPO(po);
    setShowViewPOModal(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', po.created_by)
      .maybeSingle();

    setPoCreatorName(profile?.full_name || 'Unknown');
  }

  async function handleCreatePR(formData: FormData) {
    if (!profile) return;

    const { data: prNumberData, error: prNumberError } = await supabase.rpc('generate_pr_number');
    if (prNumberError) throw prNumberError;
    const prNumber = prNumberData as string;

    const pr = {
      pr_number: prNumber,
      liters_requested: parseFloat(formData.get('liters') as string),
      requisition_date: formData.get('date') as string,
      price_per_liter: parseFloat(formData.get('price') as string),
      notes: formData.get('notes') as string,
      status: 'submitted' as const,
      created_by: profile.id,
      is_test_data: isTestingMode,
    };

    const { error } = await supabase.from('purchase_requisitions').insert([pr]);

    if (!error) {
      setShowPRModal(false);
      loadData();
    }
  }

  async function handleEditPR(pr: PR, formData: FormData) {
    const updates = {
      liters_requested: parseFloat(formData.get('liters') as string),
      price_per_liter: parseFloat(formData.get('price') as string),
      status: 'under_review' as const,
    };

    const { error } = await supabase
      .from('purchase_requisitions')
      .update(updates)
      .eq('id', pr.id);

    if (!error) {
      setSelectedPR(null);
      loadData();
    }
  }

  async function handleApprovePR(pr: PR) {
    const { error } = await supabase
      .from('purchase_requisitions')
      .update({ status: 'under_review' as const })
      .eq('id', pr.id);

    if (!error) {
      setSelectedPR({ ...pr, status: 'under_review' });
      loadData();
    }
  }

  async function handleCreatePO(pr: PR, formData: FormData) {
    if (!profile) return;

    setUploading(true);
    let proofOfPaymentUrl: string | null = null;

    try {
      if (uploadedFile) {
        const fileExt = uploadedFile.name.split('.').pop();
        const fileName = `${generatePONumber()}_${Date.now()}.${fileExt}`;
        const filePath = `purchase-orders/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('procurement-documents')
          .upload(filePath, uploadedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('procurement-documents')
          .getPublicUrl(filePath);

        proofOfPaymentUrl = urlData.publicUrl;
      }

      let supplierId = selectedSupplierId;
      const supplierName = formData.get('supplier') as string;
      const supplierContact = formData.get('contact') as string;

      if (useNewSupplier && supplierName) {
        const { data: newSupplier, error: supplierError } = await supabase
          .from('suppliers')
          .insert([{
            name: supplierName,
            contact: supplierContact,
            is_test_data: isTestingMode,
          }])
          .select()
          .single();

        if (supplierError) throw supplierError;
        supplierId = newSupplier.id;
      }

      const { data: poNumberData, error: poNumberError } = await supabase.rpc('generate_po_number');
      if (poNumberError) throw poNumberError;
      const poNumber = poNumberData as string;

      const po = {
        po_number: poNumber,
        pr_id: pr.id,
        liters_ordered: parseFloat(formData.get('liters') as string),
        price_per_liter: parseFloat(formData.get('price') as string),
        supplier_id: supplierId || null,
        supplier_name: supplierName,
        supplier_contact: supplierContact,
        payment_date: formData.get('payment_date') as string || null,
        proof_of_payment_url: proofOfPaymentUrl,
        status: proofOfPaymentUrl ? 'paid' as const : 'sent_to_supplier' as const,
        created_by: profile.id,
        is_test_data: isTestingMode,
      };

      const [poResult, prUpdate] = await Promise.all([
        supabase.from('purchase_orders').insert([po]),
        supabase
          .from('purchase_requisitions')
          .update({ status: 'converted_to_po' as const })
          .eq('id', pr.id),
      ]);

      if (!poResult.error && !prUpdate.error) {
        setSelectedPR(null);
        setShowPOModal(false);
        setUploadedFile(null);
        setSelectedSupplierId('');
        setUseNewSupplier(false);
        loadData();
        loadSuppliers();
      }
    } catch (error) {
      console.error('Error creating PO:', error);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateGR(po: PO, formData: FormData) {
    if (!profile || submitting) return;

    setSubmitting(true);
    try {
      const litersReceived = parseFloat(formData.get('liters') as string);
      const receiptDate = formData.get('date') as string;

      const { data: grNumberData, error: grNumberError } = await supabase.rpc('generate_gr_number');
      if (grNumberError) throw grNumberError;
      const grNumber = grNumberData as string;

      const gr = {
        gr_number: grNumber,
        po_id: po.id,
        liters_received: litersReceived,
        receipt_date: receiptDate,
        cost_per_liter: po.price_per_liter,
        status: 'received' as const,
        created_by: profile.id,
        is_test_data: isTestingMode,
      };

      const grResult = await supabase.from('goods_received').insert([gr]).select().single();

      if (grResult.error) {
        alert('Error creating GR');
        return;
      }

      await supabase
        .from('purchase_orders')
        .update({ status: 'goods_received' as const })
        .eq('id', po.id);

      const opsUsers = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['operations_supervisor', 'general_manager']);

      if (opsUsers.data) {
        const notifications = opsUsers.data.map((user) => ({
          user_id: user.id,
          title: 'New Goods Received',
          message: `GR ${grNumber} has been generated for PO ${po.po_number}`,
          type: 'gr_generated',
          reference_id: grResult.data.id,
          is_test_data: isTestingMode,
        }));

        await supabase.from('notifications').insert(notifications);
      }

      setSelectedPO(null);
      setShowGRModal(false);
      loadData();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAllocateToTank() {
    if (!selectedGR || !profile || submitting) return;

    if (isSplitMode) {
      if (tankAllocations.length === 0) {
        alert('Please add at least one tank allocation.');
        return;
      }

      const totalAllocated = tankAllocations.reduce((sum, a) => sum + a.liters, 0);
      if (Math.abs(totalAllocated - selectedGR.liters_received) > 0.01) {
        alert(`Total allocated (${totalAllocated}L) must equal GR amount (${selectedGR.liters_received}L).`);
        return;
      }

      for (const allocation of tankAllocations) {
        const tank = tanks.find((t) => t.id === allocation.tankId);
        if (!tank) continue;
        if (tank.current_liters + allocation.liters > tank.capacity_liters) {
          alert(`Tank ${tank.tank_name} does not have enough capacity for ${allocation.liters}L.`);
          return;
        }
      }

      setSubmitting(true);
      try {
        const inventoryItems = tankAllocations.map((allocation) => ({
          gr_id: selectedGR.id,
          tank_id: allocation.tankId,
          initial_liters: allocation.liters,
          remaining_liters: allocation.liters,
          cost_per_liter: selectedGR.cost_per_liter,
          is_test_data: isTestingMode,
        }));

        const tankUpdates = tankAllocations.map((allocation) => {
          const tank = tanks.find((t) => t.id === allocation.tankId);
          if (!tank) return null;
          return supabase
            .from('inventory_tanks')
            .update({ current_liters: tank.current_liters + allocation.liters })
            .eq('id', tank.id);
        }).filter(Boolean);

        const [itemResult, grUpdate, ...updateResults] = await Promise.all([
          supabase.from('inventory_items').insert(inventoryItems),
          supabase
            .from('goods_received')
            .update({ status: 'allocated_to_inventory' })
            .eq('id', selectedGR.id),
          ...tankUpdates,
        ]);

        if (!itemResult.error && !grUpdate.error) {
          setShowAllocateModal(false);
          setSelectedGR(null);
          setTankAllocations([]);
          setIsSplitMode(false);
          loadData();
          loadTanks();
        }
      } finally {
        setSubmitting(false);
      }
    } else {
      if (!selectedTankId) return;

      const tank = tanks.find((t) => t.id === selectedTankId);
      if (!tank) return;

      if (tank.current_liters + selectedGR.liters_received > tank.capacity_liters) {
        alert('Tank does not have enough capacity for this allocation.');
        return;
      }

      setSubmitting(true);
      try {
        const inventoryItem = {
          gr_id: selectedGR.id,
          tank_id: tank.id,
          initial_liters: selectedGR.liters_received,
          remaining_liters: selectedGR.liters_received,
          cost_per_liter: selectedGR.cost_per_liter,
          is_test_data: isTestingMode,
        };

        const [itemResult, tankUpdate, grUpdate] = await Promise.all([
          supabase.from('inventory_items').insert([inventoryItem]),
          supabase
            .from('inventory_tanks')
            .update({ current_liters: tank.current_liters + selectedGR.liters_received })
            .eq('id', tank.id),
          supabase
            .from('goods_received')
            .update({ status: 'allocated_to_inventory' })
            .eq('id', selectedGR.id),
        ]);

        if (!itemResult.error && !tankUpdate.error && !grUpdate.error) {
          setShowAllocateModal(false);
          setSelectedGR(null);
          setSelectedTankId('');
          loadData();
          loadTanks();
        }
      } finally {
        setSubmitting(false);
      }
    }
  }

  function getSuggestedTank(gr: GR): Tank | null {
    const sortedTanks = [...tanks].sort((a, b) => {
      const aAvailable = a.capacity_liters - a.current_liters;
      const bAvailable = b.capacity_liters - b.current_liters;
      const aFitScore = aAvailable >= gr.liters_received ? 1000 - (aAvailable - gr.liters_received) : -1;
      const bFitScore = bAvailable >= gr.liters_received ? 1000 - (bAvailable - gr.liters_received) : -1;
      return bFitScore - aFitScore;
    });

    const bestTank = sortedTanks[0];
    return bestTank && (bestTank.capacity_liters - bestTank.current_liters) >= gr.liters_received ? bestTank : null;
  }

  function addTankAllocation(tankId: string, liters: number) {
    if (!tankId || liters <= 0) return;
    setTankAllocations([...tankAllocations, { tankId, liters }]);
  }

  function removeTankAllocation(index: number) {
    setTankAllocations(tankAllocations.filter((_, i) => i !== index));
  }

  function updateTankAllocation(index: number, liters: number) {
    const updated = [...tankAllocations];
    updated[index].liters = liters;
    setTankAllocations(updated);
  }

  function getAvailableCapacity(tankId: string): number {
    const tank = tanks.find((t) => t.id === tankId);
    if (!tank) return 0;
    const allocatedToThisTank = tankAllocations
      .filter((a) => a.tankId === tankId)
      .reduce((sum, a) => sum + a.liters, 0);
    return tank.capacity_liters - tank.current_liters - allocatedToThisTank;
  }

  function getRemainingToAllocate(): number {
    if (!selectedGR) return 0;
    const totalAllocated = tankAllocations.reduce((sum, a) => sum + a.liters, 0);
    return selectedGR.liters_received - totalAllocated;
  }

  async function handleVoidPO() {
    if (!selectedPO || !profile || !voidReason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'voided' as any,
          void_reason: voidReason.trim(),
          voided_at: new Date().toISOString(),
          voided_by: profile.id,
        })
        .eq('id', selectedPO.id);

      if (!error) {
        setShowVoidModal(false);
        setSelectedPO(null);
        setVoidReason('');
        loadData();
      }
    } catch (error) {
      console.error('Error voiding PO:', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAmendPO(formData: FormData) {
    if (!selectedPO || !profile) return;
    setSubmitting(true);
    try {
      let supplierId = selectedSupplierId || selectedPO.supplier_id;
      const supplierName = formData.get('supplier') as string;
      const supplierContact = formData.get('contact') as string;

      const { data: poNumberData, error: poNumberError } = await supabase.rpc('generate_po_number');
      if (poNumberError) throw poNumberError;
      const poNumber = poNumberData as string;

      const newPO = {
        po_number: poNumber,
        pr_id: selectedPO.pr_id,
        liters_ordered: parseFloat(formData.get('liters') as string),
        price_per_liter: parseFloat(formData.get('price') as string),
        supplier_id: supplierId || null,
        supplier_name: supplierName || selectedPO.supplier_name,
        supplier_contact: supplierContact || selectedPO.supplier_contact,
        status: 'sent_to_supplier' as const,
        created_by: profile.id,
        is_test_data: isTestingMode,
        amended_from_id: selectedPO.id,
        is_amendment: true,
      };

      const [createResult, updateResult] = await Promise.all([
        supabase.from('purchase_orders').insert([newPO]),
        supabase
          .from('purchase_orders')
          .update({ status: 'amended' as any })
          .eq('id', selectedPO.id),
      ]);

      if (!createResult.error && !updateResult.error) {
        setShowAmendModal(false);
        setSelectedPO(null);
        setSelectedSupplierId('');
        loadData();
      }
    } catch (error) {
      console.error('Error amending PO:', error);
    } finally {
      setSubmitting(false);
    }
  }

  const canCreate = profile?.role === 'operations_supervisor' || profile?.role === 'super_admin' || profile?.role === 'administrator';
  const canEdit = profile?.role === 'finance' || profile?.role === 'super_admin' || profile?.role === 'general_manager';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light">Procurement</h1>
        {activeTab === 'pr' && canCreate && (
          <Button onClick={() => setShowPRModal(true)}>
            <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
            New PR
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-100">
        {(['pr', 'po', 'gr'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearchParams({ tab }); }}
            className={`px-4 py-2 text-sm font-light border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-black text-black'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab === 'pr' ? 'Purchase Requisitions' : tab === 'po' ? 'Purchase Orders' : 'Goods Received'}
          </button>
        ))}
      </div>

      {loading ? (
        <OshaliLoader variant="inline" />
      ) : (
        <div className="space-y-4">
          {activeTab === 'pr' && prs.map((pr) => (
            <Card key={pr.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleViewPR(pr)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-light">{pr.pr_number}</span>
                    <span className={`text-xs font-light px-2 py-1 rounded-full ${
                      pr.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                      pr.status === 'under_review' ? 'bg-yellow-100 text-yellow-700' :
                      pr.status === 'approved' ? 'bg-green-100 text-green-700' :
                      pr.status === 'converted_to_po' ? 'bg-purple-100 text-purple-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {pr.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-light">
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Liters</div>
                      <div>{pr.liters_requested.toLocaleString()}L</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Price/L</div>
                      <div>{formatCurrency(pr.price_per_liter)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Total</div>
                      <div>{formatCurrency(pr.liters_requested * pr.price_per_liter)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Date</div>
                      <div>{format(new Date(pr.requisition_date), 'MMM dd, yyyy')}</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {canEdit && pr.status === 'submitted' && (
                    <>
                      <Button size="sm" onClick={() => handleApprovePR(pr)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setSelectedPR(pr)}>
                        Edit
                      </Button>
                    </>
                  )}
                  {canEdit && pr.status === 'under_review' && (
                    <Button size="sm" onClick={() => { setSelectedPR(pr); setShowPOModal(true); }}>
                      Create PO
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {activeTab === 'po' && pos.map((po) => (
            <Card key={po.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleViewPO(po)}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-light">{po.po_number}</span>
                    <span className={`text-xs font-light px-2 py-1 rounded-full ${
                      po.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                      po.status === 'sent_to_supplier' ? 'bg-blue-100 text-blue-700' :
                      po.status === 'paid' ? 'bg-green-100 text-green-700' :
                      (po.status as string) === 'voided' ? 'bg-red-100 text-red-700' :
                      (po.status as string) === 'amended' ? 'bg-amber-100 text-amber-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {(po.status as string).replace(/_/g, ' ')}
                    </span>
                    {(po as any).is_amendment && (
                      <span className="text-xs font-light px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                        Amendment
                      </span>
                    )}
                    {po.proof_of_payment_url && (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" strokeWidth={1} />
                        POP Uploaded
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-light mb-3">
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Supplier</div>
                      <div>{po.supplier_name}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Liters</div>
                      <div>{po.liters_ordered.toLocaleString()}L</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Price/L</div>
                      <div>{formatCurrency(po.price_per_liter)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Total</div>
                      <div>{formatCurrency(po.total_amount)}</div>
                    </div>
                  </div>
                  {(po as any).void_reason && (
                    <div className="text-xs font-light text-red-600 bg-red-50 rounded px-2 py-1 mb-2">
                      Void reason: {(po as any).void_reason}
                    </div>
                  )}
                  {po.proof_of_payment_url && (
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      <FileIcon className="w-4 h-4 text-gray-400" strokeWidth={1} />
                      <a
                        href={po.proof_of_payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 font-light"
                      >
                        View Proof of Payment
                      </a>
                      {po.payment_date && (
                        <span className="text-xs text-gray-500 ml-auto">
                          Paid: {format(new Date(po.payment_date), 'MMM dd, yyyy')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 items-start" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="secondary">
                    <Download className="w-4 h-4" strokeWidth={1} />
                  </Button>
                  {canEdit && (po.status === 'sent_to_supplier' || po.status === 'paid') && (
                    <Button size="sm" onClick={() => { setSelectedPO(po); setShowGRModal(true); }}>
                      Create GR
                    </Button>
                  )}
                  {canEdit && (po.status as string) !== 'voided' && (po.status as string) !== 'amended' && (po.status as string) !== 'goods_received' && (
                    <div className="relative">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPoActionMenu(poActionMenu === po.id ? null : po.id)}
                      >
                        <MoreVertical className="w-4 h-4" strokeWidth={1.5} />
                      </Button>
                      {poActionMenu === po.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[140px]">
                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setShowAmendModal(true);
                              setPoActionMenu(null);
                            }}
                            className="w-full text-left px-3 py-2 text-sm font-light hover:bg-gray-50 flex items-center gap-2 rounded-t-lg"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-gray-500" strokeWidth={1.5} />
                            Amend
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPO(po);
                              setShowVoidModal(true);
                              setPoActionMenu(null);
                            }}
                            className="w-full text-left px-3 py-2 text-sm font-light text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-b-lg"
                          >
                            <XCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                            Void
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {activeTab === 'gr' && grs.map((gr) => (
            <Card key={gr.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-light">{gr.gr_number}</span>
                    <span className={`text-xs font-light px-2 py-1 rounded-full ${
                      gr.status === 'received' ? 'bg-blue-100 text-blue-700' :
                      gr.status === 'allocated_to_inventory' ? 'bg-green-100 text-green-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {gr.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-light">
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Liters</div>
                      <div>{gr.liters_received.toLocaleString()}L</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Cost/L</div>
                      <div>{formatCurrency(gr.cost_per_liter)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Total Cost</div>
                      <div>{formatCurrency(gr.total_cost)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Receipt Date</div>
                      <div>{format(new Date(gr.receipt_date), 'MMM dd, yyyy')}</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {canCreate && gr.status === 'received' && (
                    <Button size="sm" onClick={() => { setSelectedGR(gr); setShowAllocateModal(true); const suggested = getSuggestedTank(gr); if (suggested) setSelectedTankId(suggested.id); }}>
                      <Package className="w-4 h-4 mr-1" strokeWidth={1} />
                      Allocate
                    </Button>
                  )}
                  <Button size="sm" variant="secondary">
                    <Download className="w-4 h-4" strokeWidth={1} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showPRModal} onClose={() => setShowPRModal(false)} title="Create Purchase Requisition">
        <form onSubmit={(e) => { e.preventDefault(); handleCreatePR(new FormData(e.currentTarget)); }}>
          <div className="space-y-4">
            <Input name="liters" label="Liters Requested" type="number" step="0.01" required />
            <Input name="price" label="Price per Liter" type="number" step="0.01" required />
            <Input name="date" label="Requisition Date" type="date" required />
            <Input name="notes" label="Notes" />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">Create PR</Button>
              <Button type="button" variant="secondary" onClick={() => setShowPRModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showViewPRModal} onClose={() => { setShowViewPRModal(false); setSelectedPR(null); }} title="Purchase Requisition Details">
        {selectedPR && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">PR Number</div>
                <div className="font-light">{selectedPR.pr_number}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <span className={`text-xs font-light px-2 py-1 rounded-full ${
                  selectedPR.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                  selectedPR.status === 'under_review' ? 'bg-yellow-100 text-yellow-700' :
                  selectedPR.status === 'approved' ? 'bg-green-100 text-green-700' :
                  selectedPR.status === 'converted_to_po' ? 'bg-purple-100 text-purple-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {selectedPR.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Liters Requested</div>
                <div className="font-light">{selectedPR.liters_requested.toLocaleString()}L</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Price per Liter</div>
                <div className="font-light">{formatCurrency(selectedPR.price_per_liter)}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Total Amount</div>
              <div className="text-xl font-light">{formatCurrency(selectedPR.liters_requested * selectedPR.price_per_liter)}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Requisition Date</div>
                <div className="font-light">{format(new Date(selectedPR.requisition_date), 'MMM dd, yyyy')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Created By</div>
                <div className="font-light">{prCreatorName}</div>
              </div>
            </div>

            {selectedPR.notes && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                <div className="font-light text-sm bg-gray-50 p-3 rounded-lg">{selectedPR.notes}</div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-gray-100">
              {canEdit && selectedPR.status === 'submitted' && (
                <>
                  <Button
                    className="flex-1"
                    onClick={() => handleApprovePR(selectedPR)}
                  >
                    Approve for Review
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => { setShowViewPRModal(false); }}
                  >
                    Edit PR
                  </Button>
                </>
              )}
              {canEdit && selectedPR.status === 'under_review' && (
                <Button
                  className="flex-1"
                  onClick={() => { setShowViewPRModal(false); setShowPOModal(true); }}
                >
                  Create Purchase Order
                </Button>
              )}
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setShowViewPRModal(false); setSelectedPR(null); }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!selectedPR && !showPOModal && !showViewPRModal} onClose={() => setSelectedPR(null)} title="Edit Purchase Requisition">
        {selectedPR && (
          <form onSubmit={(e) => { e.preventDefault(); handleEditPR(selectedPR, new FormData(e.currentTarget)); }}>
            <div className="space-y-4">
              <Input name="liters" label="Liters Requested" type="number" step="0.01" defaultValue={selectedPR.liters_requested} required />
              <Input name="price" label="Price per Liter" type="number" step="0.01" defaultValue={selectedPR.price_per_liter} required />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1">Update PR</Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedPR(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={showViewPOModal} onClose={() => { setShowViewPOModal(false); setSelectedPO(null); }} title="Purchase Order Details">
        {selectedPO && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">PO Number</div>
                <div className="font-light">{selectedPO.po_number}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Status</div>
                <span className={`text-xs font-light px-2 py-1 rounded-full ${
                  selectedPO.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                  selectedPO.status === 'sent_to_supplier' ? 'bg-blue-100 text-blue-700' :
                  selectedPO.status === 'paid' ? 'bg-green-100 text-green-700' :
                  (selectedPO.status as string) === 'voided' ? 'bg-red-100 text-red-700' :
                  (selectedPO.status as string) === 'amended' ? 'bg-amber-100 text-amber-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {(selectedPO.status as string).replace(/_/g, ' ')}
                </span>
                {(selectedPO as any).is_amendment && (
                  <span className="ml-2 text-xs font-light px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                    Amendment
                  </span>
                )}
              </div>
            </div>

            {(selectedPO as any).void_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-xs text-red-500 mb-1">Void Reason</div>
                <div className="text-sm font-light text-red-800">{(selectedPO as any).void_reason}</div>
                {(selectedPO as any).voided_at && (
                  <div className="text-xs text-red-400 mt-1">
                    Voided: {format(new Date((selectedPO as any).voided_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Supplier</div>
                <div className="font-light">{selectedPO.supplier_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Supplier Contact</div>
                <div className="font-light">{selectedPO.supplier_contact || 'N/A'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Liters Ordered</div>
                <div className="font-light">{selectedPO.liters_ordered.toLocaleString()}L</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Price per Liter</div>
                <div className="font-light">{formatCurrency(selectedPO.price_per_liter)}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Total Amount</div>
              <div className="text-xl font-light">{formatCurrency(selectedPO.total_amount)}</div>
            </div>

            {selectedPO.payment_date && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Payment Date</div>
                <div className="font-light">{format(new Date(selectedPO.payment_date), 'MMM dd, yyyy')}</div>
              </div>
            )}

            {selectedPO.proof_of_payment_url && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Proof of Payment</div>
                <a
                  href={selectedPO.proof_of_payment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-light"
                >
                  <FileIcon className="w-4 h-4" strokeWidth={1} />
                  View Document
                </a>
              </div>
            )}

            <div>
              <div className="text-xs text-gray-500 mb-1">Created By</div>
              <div className="font-light">{poCreatorName}</div>
            </div>

            {selectedPO.notes && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Notes</div>
                <div className="font-light text-sm bg-gray-50 p-3 rounded-lg">{selectedPO.notes}</div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-gray-100">
              {canEdit && (selectedPO.status === 'sent_to_supplier' || selectedPO.status === 'paid') && (
                <Button
                  onClick={() => { setShowViewPOModal(false); setShowGRModal(true); }}
                >
                  Create GR
                </Button>
              )}
              {canEdit && (selectedPO.status as string) !== 'voided' && (selectedPO.status as string) !== 'amended' && (selectedPO.status as string) !== 'goods_received' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => { setShowViewPOModal(false); setShowAmendModal(true); }}
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                    Amend
                  </Button>
                  <Button
                    variant="secondary"
                    className="!text-red-600 !border-red-200 hover:!bg-red-50"
                    onClick={() => { setShowViewPOModal(false); setShowVoidModal(true); }}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} />
                    Void
                  </Button>
                </>
              )}
              <Button
                variant="secondary"
                onClick={() => { setShowViewPOModal(false); setSelectedPO(null); }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showPOModal && !!selectedPR} onClose={() => { setShowPOModal(false); setSelectedPR(null); setUploadedFile(null); setSelectedSupplierId(''); setUseNewSupplier(false); }} title="Create Purchase Order">
        {selectedPR && (
          <div className="relative">
            {uploading && <OshaliLoader variant="overlay" message="Creating purchase order..." />}
            <form onSubmit={(e) => { e.preventDefault(); handleCreatePO(selectedPR, new FormData(e.currentTarget)); }}>
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => { setUseNewSupplier(false); setSelectedSupplierId(''); }}
                  className={`flex-1 py-2 px-3 text-sm font-light rounded-lg transition-colors ${
                    !useNewSupplier
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Existing Supplier
                </button>
                <button
                  type="button"
                  onClick={() => { setUseNewSupplier(true); setSelectedSupplierId(''); }}
                  className={`flex-1 py-2 px-3 text-sm font-light rounded-lg transition-colors ${
                    useNewSupplier
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  New Supplier
                </button>
              </div>

              {!useNewSupplier ? (
                <Select
                  label="Supplier"
                  value={selectedSupplierId}
                  onChange={(e) => {
                    const supplierId = e.target.value;
                    setSelectedSupplierId(supplierId);
                    const supplier = suppliers.find((s) => s.id === supplierId);
                    if (supplier) {
                      const form = e.target.form;
                      if (form) {
                        const supplierInput = form.elements.namedItem('supplier') as HTMLInputElement;
                        const contactInput = form.elements.namedItem('contact') as HTMLInputElement;
                        if (supplierInput) supplierInput.value = supplier.name;
                        if (contactInput) contactInput.value = supplier.contact || '';
                      }
                    }
                  }}
                  required={!useNewSupplier}
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              ) : null}

              <Input
                name="supplier"
                label="Supplier Name"
                required
                readOnly={!useNewSupplier && !!selectedSupplierId}
                defaultValue={!useNewSupplier && selectedSupplierId ? suppliers.find((s) => s.id === selectedSupplierId)?.name : ''}
              />
              <Input
                name="contact"
                label="Supplier Contact"
                readOnly={!useNewSupplier && !!selectedSupplierId}
                defaultValue={!useNewSupplier && selectedSupplierId ? suppliers.find((s) => s.id === selectedSupplierId)?.contact || '' : ''}
              />
              <Input name="liters" label="Liters to Order" type="number" step="0.01" defaultValue={selectedPR.liters_requested} required />
              <Input name="price" label="Price per Liter" type="number" step="0.01" defaultValue={selectedPR.price_per_liter} required />
              <Input name="payment_date" label="Payment Date" type="date" />

              <div className="space-y-2">
                <label className="block text-sm font-light text-gray-700">
                  Proof of Payment
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-center px-4 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <Upload className="w-4 h-4 mr-2" strokeWidth={1} />
                    <span className="text-sm font-light">
                      {uploadedFile ? uploadedFile.name : 'Choose file'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {uploadedFile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setUploadedFile(null)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500 font-light">
                  Supported formats: PDF, JPG, PNG (Max 5MB)
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={uploading}>
                  {uploading ? 'Creating...' : 'Create PO'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setShowPOModal(false); setSelectedPR(null); setUploadedFile(null); setSelectedSupplierId(''); setUseNewSupplier(false); }}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
          </div>
        )}
      </Modal>

      <Modal isOpen={showGRModal && !!selectedPO && !showViewPOModal} onClose={() => { setShowGRModal(false); setSelectedPO(null); }} title="Create Goods Received">
        {selectedPO && (
          <div className="relative">
            {submitting && <OshaliLoader variant="overlay" message="Uploading document..." />}
            <form onSubmit={(e) => { e.preventDefault(); handleCreateGR(selectedPO, new FormData(e.currentTarget)); }}>
            <div className="space-y-4">
              <Input name="liters" label="Liters Received" type="number" step="0.01" defaultValue={selectedPO.liters_ordered} required />
              <Input name="date" label="Receipt Date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create GR'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setShowGRModal(false); setSelectedPO(null); }} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showAllocateModal}
        onClose={() => {
          setShowAllocateModal(false);
          setSelectedGR(null);
          setSelectedTankId('');
          setTankAllocations([]);
          setIsSplitMode(false);
        }}
        title="Allocate to Tank"
      >
        {selectedGR && (
          <div className="relative">
            {submitting && <OshaliLoader variant="overlay" message="Submitting requisition..." />}
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2 font-light">
              <div className="flex justify-between">
                <span className="text-gray-600">GR Number:</span>
                <span className="font-normal">{selectedGR.gr_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Liters:</span>
                <span className="font-normal">{selectedGR.liters_received.toLocaleString()}L</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cost per Liter:</span>
                <span className="font-normal">{formatCurrency(selectedGR.cost_per_liter)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <button
                onClick={() => { setIsSplitMode(false); setTankAllocations([]); }}
                className={`flex-1 py-2 px-3 text-sm font-light rounded-lg transition-colors ${
                  !isSplitMode
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Single Tank
              </button>
              <button
                onClick={() => { setIsSplitMode(true); setSelectedTankId(''); }}
                className={`flex-1 py-2 px-3 text-sm font-light rounded-lg transition-colors flex items-center justify-center gap-1 ${
                  isSplitMode
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Split className="w-3 h-3" strokeWidth={1.5} />
                Split Across Tanks
              </button>
            </div>

            {!isSplitMode ? (
              <>
                <Select
                  label="Select Tank"
                  value={selectedTankId}
                  onChange={(e) => setSelectedTankId(e.target.value)}
                >
                  <option value="">Choose a tank...</option>
                  {tanks.map((tank) => {
                    const available = tank.capacity_liters - tank.current_liters;
                    const canFit = available >= selectedGR.liters_received;
                    const suggested = getSuggestedTank(selectedGR);
                    const isSuggested = suggested?.id === tank.id;

                    return (
                      <option key={tank.id} value={tank.id} disabled={!canFit}>
                        Tank {tank.tank_name} - {available.toLocaleString()}L available
                        {isSuggested ? ' (Recommended)' : ''}
                        {!canFit ? ' (Insufficient capacity)' : ''}
                      </option>
                    );
                  })}
                </Select>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-light">
                    <span className="text-gray-600">Remaining to allocate:</span>
                    <span className={`ml-2 font-normal ${getRemainingToAllocate() === 0 ? 'text-green-600' : 'text-blue-600'}`}>
                      {getRemainingToAllocate().toLocaleString()}L
                    </span>
                  </div>
                </div>

                {tankAllocations.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {tankAllocations.map((allocation, index) => {
                      const tank = tanks.find((t) => t.id === allocation.tankId);
                      return (
                        <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <div className="text-sm font-light">Tank {tank?.tank_name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={allocation.liters}
                                onChange={(e) => updateTankAllocation(index, parseFloat(e.target.value) || 0)}
                                className="text-sm"
                              />
                              <span className="text-xs text-gray-500 whitespace-nowrap">liters</span>
                            </div>
                          </div>
                          <button
                            onClick={() => removeTankAllocation(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <Select
                    label="Add Tank"
                    value=""
                    onChange={(e) => {
                      const tankId = e.target.value;
                      if (tankId) {
                        const remaining = getRemainingToAllocate();
                        const available = getAvailableCapacity(tankId);
                        const liters = Math.min(remaining, available);
                        addTankAllocation(tankId, liters);
                        e.target.value = '';
                      }
                    }}
                    className="flex-1"
                  >
                    <option value="">Select tank to add...</option>
                    {tanks.map((tank) => {
                      const available = getAvailableCapacity(tank.id);
                      return (
                        <option key={tank.id} value={tank.id} disabled={available <= 0}>
                          Tank {tank.tank_name} - {available.toLocaleString()}L available
                        </option>
                      );
                    })}
                  </Select>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAllocateToTank}
                className="flex-1"
                disabled={
                  submitting ||
                  (!isSplitMode && !selectedTankId) ||
                  (isSplitMode && (tankAllocations.length === 0 || getRemainingToAllocate() !== 0))
                }
              >
                {submitting ? 'Allocating...' : 'Allocate to Tank'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowAllocateModal(false);
                  setSelectedGR(null);
                  setSelectedTankId('');
                  setTankAllocations([]);
                  setIsSplitMode(false);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
          </div>
        )}
      </Modal>

      {/* Void PO Modal */}
      <Modal
        isOpen={showVoidModal}
        onClose={() => { setShowVoidModal(false); setVoidReason(''); }}
        title="Void Purchase Order"
      >
        {selectedPO && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-light text-red-800">
                You are about to void <span className="font-medium">{selectedPO.po_number}</span>. This action cannot be undone. The purchase order will be marked as voided and will no longer be actionable.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm font-light">
              <div>
                <span className="text-gray-500">Supplier:</span>
                <span className="ml-2">{selectedPO.supplier_name}</span>
              </div>
              <div>
                <span className="text-gray-500">Amount:</span>
                <span className="ml-2">{formatCurrency(selectedPO.total_amount)}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-light text-gray-700 mb-1">Reason for voiding *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Explain why this purchase order is being voided..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-light focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleVoidPO}
                disabled={submitting || !voidReason.trim()}
                className="flex-1 !bg-red-600 hover:!bg-red-700 !text-white"
              >
                {submitting ? 'Voiding...' : 'Confirm Void'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setShowVoidModal(false); setVoidReason(''); }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Amend PO Modal */}
      <Modal
        isOpen={showAmendModal}
        onClose={() => { setShowAmendModal(false); setSelectedSupplierId(''); }}
        title="Amend Purchase Order"
      >
        {selectedPO && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAmendPO(new FormData(e.currentTarget));
            }}
            className="space-y-4"
          >
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-light text-blue-800">
                This will create a new amended purchase order and mark <span className="font-medium">{selectedPO.po_number}</span> as superseded. Edit the fields you want to change.
              </p>
            </div>

            <Select
              label="Supplier"
              value={selectedSupplierId || selectedPO.supplier_id || ''}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
            >
              <option value="">Keep current supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>

            <Input
              name="supplier"
              label="Supplier Name"
              defaultValue={selectedPO.supplier_name}
              required
            />
            <Input
              name="contact"
              label="Supplier Contact"
              defaultValue={selectedPO.supplier_contact || ''}
            />
            <Input
              name="liters"
              label="Liters to Order"
              type="number"
              step="0.01"
              defaultValue={selectedPO.liters_ordered}
              required
            />
            <Input
              name="price"
              label="Price per Liter"
              type="number"
              step="0.01"
              defaultValue={selectedPO.price_per_liter}
              required
            />

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Creating Amendment...' : 'Create Amendment'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setShowAmendModal(false); setSelectedSupplierId(''); }}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
