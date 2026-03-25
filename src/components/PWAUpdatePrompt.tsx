import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    let registerSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

    async function registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        const { registerSW: register } = await import('virtual:pwa-register');
        registerSW = register({
          onNeedRefresh() {
            setNeedRefresh(true);
          },
          onOfflineReady() {
            setOfflineReady(true);
            setTimeout(() => setOfflineReady(false), 4000);
          },
        });
      }
    }

    registerServiceWorker();

    return () => {
      registerSW = undefined;
    };
  }, []);

  async function handleUpdate() {
    const { registerSW } = await import('virtual:pwa-register');
    const updateSW = registerSW({
      onNeedRefresh() {},
      onOfflineReady() {},
    });
    await updateSW(true);
  }

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
    setShowInstall(false);
  }

  if (!needRefresh && !offlineReady && !showInstall) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-80">
      {offlineReady && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 shadow-lg">
          <span className="text-sm font-light text-emerald-800">App ready for offline use</span>
          <button
            onClick={() => setOfflineReady(false)}
            className="ml-auto text-emerald-600 hover:text-emerald-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {needRefresh && (
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 shadow-lg">
          <span className="text-sm font-light text-blue-800">Update available</span>
          <button
            onClick={handleUpdate}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Update
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showInstall && (
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 shadow-lg">
          <span className="text-sm font-light text-gray-800">Install Oshali Fuel app</span>
          <button
            onClick={handleInstall}
            className="ml-auto rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
          >
            Install
          </button>
          <button
            onClick={() => setShowInstall(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
