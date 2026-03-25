import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface TestingModeContextType {
  isTestingMode: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const TestingModeContext = createContext<TestingModeContextType>({
  isTestingMode: false,
  loading: true,
  refresh: async () => {},
});

export function useTestingMode() {
  return useContext(TestingModeContext);
}

export function TestingModeProvider({ children }: { children: ReactNode }) {
  const [isTestingMode, setIsTestingMode] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadTestingMode() {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('testing_mode_enabled')
        .maybeSingle();

      if (error) throw error;
      setIsTestingMode(data?.testing_mode_enabled ?? false);
    } catch (error) {
      console.error('Error loading testing mode:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTestingMode();

    const channel = supabase
      .channel('testing-mode-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_settings',
        },
        (payload) => {
          if (payload.new && 'testing_mode_enabled' in payload.new) {
            setIsTestingMode(payload.new.testing_mode_enabled as boolean);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <TestingModeContext.Provider value={{ isTestingMode, loading, refresh: loadTestingMode }}>
      {children}
    </TestingModeContext.Provider>
  );
}
