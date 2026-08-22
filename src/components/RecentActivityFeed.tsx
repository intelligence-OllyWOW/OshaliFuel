import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import Card from './ui/Card';
import { Bell, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function RecentActivityFeed() {
  const { profile } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;

    supabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (!error && data) setActivities(data);
        setLoading(false);
      });
  }, [profile?.id]);

  const iconForType = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" strokeWidth={1.5} />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={1.5} />;
      case 'error': return <AlertTriangle className="w-4 h-4 text-red-500" strokeWidth={1.5} />;
      default: return <Info className="w-4 h-4 text-blue-500" strokeWidth={1.5} />;
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
          <Bell className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-light text-gray-500">Recent Activity</h3>
      </div>
      {loading ? (
        <div className="text-center py-8 text-sm font-light text-gray-400">Loading...</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-8 text-sm font-light text-gray-400">No recent activity</div>
      ) : (
        <div className="space-y-3">
          {activities.map((a) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                a.is_read ? 'bg-white' : 'bg-blue-50/50'
              }`}
            >
              <div className="mt-0.5">{iconForType(a.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-light text-gray-900 truncate">{a.title}</p>
                <p className="text-xs font-light text-gray-500 truncate">{a.message}</p>
              </div>
              <span className="text-xs font-light text-gray-400 whitespace-nowrap">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
