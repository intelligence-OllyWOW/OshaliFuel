import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  createdAt: number;
  exiting?: boolean;
}

interface ToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
  critical?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (options: ToastOptions) => string;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// ─── Config ──────────────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<
  ToastType,
  {
    icon: React.ElementType;
    bgClass: string;
    borderClass: string;
    iconClass: string;
    progressClass: string;
  }
> = {
  success: {
    icon: CheckCircle,
    bgClass: 'bg-gray-900/95 border-green-500/30',
    borderClass: 'border-l-green-500',
    iconClass: 'text-green-400',
    progressClass: 'bg-green-500',
  },
  error: {
    icon: XCircle,
    bgClass: 'bg-gray-900/95 border-red-500/30',
    borderClass: 'border-l-red-500',
    iconClass: 'text-red-400',
    progressClass: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-gray-900/95 border-amber-500/30',
    borderClass: 'border-l-amber-500',
    iconClass: 'text-amber-400',
    progressClass: 'bg-amber-500',
  },
  info: {
    icon: Info,
    bgClass: 'bg-gray-900/95 border-blue-500/30',
    borderClass: 'border-l-blue-500',
    iconClass: 'text-blue-400',
    progressClass: 'bg-blue-500',
  },
};

const DEFAULT_DURATION = 5000;
const CRITICAL_DURATION = 10000;
const EXIT_ANIMATION_MS = 300;

// ─── Individual Toast Component ──────────────────────────────────────────────

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;

  // Trigger entrance animation
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Progress bar countdown
  useEffect(() => {
    const startTime = toast.createdAt;
    const endTime = startTime + toast.duration;

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, endTime - now);
      const pct = (remaining / toast.duration) * 100;
      setProgress(pct);

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        onRemove(toast.id);
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [toast.createdAt, toast.duration, toast.id, onRemove]);

  const handleClose = () => {
    onRemove(toast.id);
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`
        relative overflow-hidden rounded-lg border border-l-4 shadow-2xl backdrop-blur-sm
        ${config.bgClass} ${config.borderClass}
        transform transition-all duration-300 ease-out
        ${
          isVisible && !toast.exiting
            ? 'translate-x-0 opacity-100'
            : 'translate-x-full opacity-0'
        }
        w-[380px] max-w-[calc(100vw-2rem)]
      `}
    >
      {/* Content */}
      <div className="flex items-start gap-3 p-4">
        <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${config.iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-100">{toast.title}</p>
          {toast.message && (
            <p className="mt-1 text-xs text-gray-400 leading-relaxed">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 rounded-md p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gray-600"
          aria-label="Close notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800">
        <div
          className={`h-full ${config.progressClass} transition-all duration-100 ease-linear`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Toast Provider ──────────────────────────────────────────────────────────

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    // Mark as exiting for animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );

    // Remove after exit animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const addToast = useCallback((options: ToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const type = options.type || 'info';
    const isCritical = options.critical ?? type === 'error';
    const duration = options.duration ?? (isCritical ? CRITICAL_DURATION : DEFAULT_DURATION);

    const toast: Toast = {
      id,
      type,
      title: options.title,
      message: options.message,
      duration,
      createdAt: Date.now(),
    };

    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const success = useCallback(
    (title: string, message?: string) =>
      addToast({ title, message, type: 'success' }),
    [addToast]
  );

  const error = useCallback(
    (title: string, message?: string) =>
      addToast({ title, message, type: 'error', critical: true }),
    [addToast]
  );

  const warning = useCallback(
    (title: string, message?: string) =>
      addToast({ title, message, type: 'warning' }),
    [addToast]
  );

  const info = useCallback(
    (title: string, message?: string) =>
      addToast({ title, message, type: 'info' }),
    [addToast]
  );

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast Container */}
      <div
        aria-label="Notifications"
        className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onRemove={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastProvider;
