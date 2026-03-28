import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import OshaliLoader from '../components/OshaliLoader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import type { Database } from '../lib/database.types';

type PricingSetting = Database['public']['Tables']['pricing_settings']['Row'];

export default function Pricing() {
  const { profile } = useAuth();
  const [pricingHistory, setPricingHistory] = useState<PricingSetting[]>([]);
  const [currentPrice, setCurrentPrice] = useState<PricingSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadPricing();
  }, []);

  async function loadPricing() {
    try {
      const { data } = await supabase
        .from('pricing_settings')
        .select('*')
        .order('created_at', { ascending: false });

      if (data && data.length > 0) {
        setCurrentPrice(data[0]);
        setPricingHistory(data);
      }
    } catch (error) {
      console.error('Error loading pricing:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetPrice(formData: FormData) {
    if (!profile) return;

    const newPrice = {
      price_per_liter: parseFloat(formData.get('price') as string),
      set_by: profile.id,
    };

    const { error } = await supabase
      .from('pricing_settings')
      .insert([newPrice]);

    if (!error) {
      setShowModal(false);
      loadPricing();
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-light">Pricing Management</h1>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-2" strokeWidth={1} />
          Update Price
        </Button>
      </div>

      {loading ? (
        <OshaliLoader variant="inline" />
      ) : (
        <>
          {currentPrice && (
            <Card className="mb-6">
              <div className="text-center">
                <div className="text-sm font-light text-gray-500 mb-2">Current Selling Price</div>
                <div className="text-5xl font-light mb-2">{formatCurrency(currentPrice.price_per_liter)}</div>
                <div className="text-xs font-light text-gray-500">per liter</div>
                <div className="mt-4 text-xs font-light text-gray-400">
                  Last updated: {format(new Date(currentPrice.created_at), 'MMM dd, yyyy HH:mm')}
                </div>
              </div>
            </Card>
          )}

          <h2 className="text-lg font-light mb-4">Pricing History</h2>
          <div className="space-y-3">
            {pricingHistory.map((price) => (
              <Card key={price.id}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-light">{formatCurrency(price.price_per_liter)}</div>
                      <div className="text-sm font-light text-gray-500">
                        {format(new Date(price.created_at), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </div>
                  </div>
                  {price.id === currentPrice?.id && (
                    <span className="text-xs font-light px-3 py-1 bg-green-100 text-green-700 rounded-full">
                      Current
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Update Selling Price">
        <form onSubmit={(e) => { e.preventDefault(); handleSetPrice(new FormData(e.currentTarget)); }}>
          <div className="space-y-4">
            <Input
              name="price"
              label="Price per Liter (N$)"
              type="number"
              step="0.01"
              min="0"
              required
            />
            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <p className="text-xs font-light text-yellow-800">
                This will update the selling price for all future sales. Existing invoices will not be affected.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Update Price
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
