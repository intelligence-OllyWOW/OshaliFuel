import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fuel } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';

export default function Setup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  async function createSuperAdmin() {
    setLoading(true);
    setError('');

    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', 'super@oshali.com')
        .maybeSingle();

      if (existingProfile) {
        setError('Super admin already exists. Please sign in.');
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: 'super@oshali.com',
        password: 'super123',
        options: {
          data: {
            full_name: 'Super Admin'
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: authData.user.id,
          email: 'super@oshali.com',
          full_name: 'Super Admin',
          role: 'super_admin'
        }]);

      if (profileError) throw profileError;

      await supabase.auth.signOut();

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to create super admin');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <Fuel className="w-8 h-8" strokeWidth={1} />
            <span className="text-2xl font-light">Oshali Fuel</span>
          </div>
        </div>

        <div className="backdrop-blur-xl bg-glass-light rounded-2xl p-8 shadow-sm border border-gray-100">
          <h1 className="text-xl font-light text-center mb-6">Initial Setup</h1>

          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="text-sm font-light text-gray-600 mb-3">
              Create the first super admin account:
            </div>
            <div className="space-y-2 text-sm font-light">
              <div className="flex justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="font-medium">super@oshali.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Password:</span>
                <span className="font-medium">super123</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Role:</span>
                <span className="font-medium">Super Admin</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm font-light text-red-600">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm font-light text-green-600">
              Super admin created successfully! Redirecting to login...
            </div>
          )}

          <Button
            onClick={createSuperAdmin}
            disabled={loading || success}
            className="w-full"
          >
            {loading ? 'Creating...' : success ? 'Created!' : 'Create Super Admin'}
          </Button>

          <div className="mt-4 text-center">
            <a
              href="/login"
              className="text-sm font-light text-gray-500 hover:text-gray-700"
            >
              Already have an account? Sign in
            </a>
          </div>
        </div>

        <div className="mt-6 p-4 text-xs font-light text-gray-400 text-center">
          After creating the super admin, you can create other users through the Users page.
        </div>
      </div>
    </div>
  );
}
