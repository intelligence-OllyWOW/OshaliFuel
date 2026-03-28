import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { Database } from '../lib/database.types';

type Notification = Database['public']['Tables']['notifications']['Row'];

interface Props {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getNotificationRoute(type: string, referenceId: string | null): string {
  switch (type) {
    case 'gr_created':
    case 'gr_allocated':
      return '/procurement?tab=gr';
    case 'pr_created':
    case 'pr_submitted':
    case 'pr_approved':
      return '/procurement?tab=pr';
    case 'po_created':
    case 'po_paid':
      return '/procurement?tab=po';
    case 'invoice_created':
    case 'invoice_settled':
    case 'invoice_void':
      return '/sales?tab=invoices';
    case 'delivery_note_created':
      return '/sales?tab=delivery_notes';
    default:
      return '/';
  }
}

export default function NotificationDropdown({
  notifications,
  unreadCount,
  loading,
  markAsRead,
  markAllAsRead,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleMouseDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open]);

  async function handleNotificationClick(n: Notification) {
    await markAsRead(n.id);
    setOpen(false);
    navigate(getNotificationRoute(n.type, n.reference_id));
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 hover:bg-gray-50 rounded-full transition-colors"
      >
        <Bell className="w-5 h-5" strokeWidth={1} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-semibold text-white leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 text-xs text-[#F5A623] hover:text-amber-600 transition-colors"
              >
                <Check className="w-3 h-3" strokeWidth={2} />
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                    <div className="h-2 bg-gray-100 rounded w-full" />
                    <div className="h-2 bg-gray-100 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Bell className="w-8 h-8 mb-2" strokeWidth={1} />
                <span className="text-sm font-light">No notifications yet</span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 ${
                    !n.is_read ? 'bg-amber-50' : 'bg-white'
                  }`}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-1.5">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        !n.is_read ? 'bg-[#F5A623]' : 'bg-gray-300'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm text-gray-900 ${
                        !n.is_read ? 'font-semibold' : 'font-normal'
                      }`}
                    >
                      {n.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {getRelativeTime(n.created_at)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
