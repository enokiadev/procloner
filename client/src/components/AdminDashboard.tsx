import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Users, Activity, Download, Clock, TrendingUp } from 'lucide-react';

interface Stats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  last7Days: Array<{
    date: string;
    totalSessions: number;
    uniqueUsers: number;
    totalSizeGB: number;
    totalFiles: number;
  }>;
}

interface SessionData {
  id: string;
  url: string;
  status: string;
  progress: number;
  startTime: string;
  userId: string;
  assets: number;
}

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchStats();
      fetchSessions();
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/admin/sessions', {
        credentials: 'include'
      });
      const data = await response.json();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className=\"flex items-center justify-center min-h-screen\">
        <div className=\"text-center\">
          <h2 className=\"text-2xl font-bold text-gray-900 mb-2\">Access Denied</h2>
          <p className=\"text-gray-600\">You don't have admin privileges.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className=\"flex items-center justify-center min-h-screen\">
        <div className=\"animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600\"></div>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'active': case 'crawling': case 'processing': return 'text-blue-600 bg-blue-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className=\"min-h-screen bg-gray-50 p-6\">
      <div className=\"max-w-7xl mx-auto\">
        <div className=\"mb-8\">
          <h1 className=\"text-3xl font-bold text-gray-900\">Admin Dashboard</h1>
          <p className=\"text-gray-600 mt-2\">Monitor ProCloner usage and analytics</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className=\"grid grid-cols-1 md:grid-cols-4 gap-6 mb-8\">
            <div className=\"bg-white rounded-lg shadow p-6\">
              <div className=\"flex items-center\">
                <div className=\"p-3 rounded-full bg-blue-100\">
                  <BarChart3 className=\"h-6 w-6 text-blue-600\" />
                </div>
                <div className=\"ml-4\">
                  <p className=\"text-sm font-medium text-gray-600\">Total Sessions</p>
                  <p className=\"text-2xl font-bold text-gray-900\">{stats.totalSessions}</p>
                </div>
              </div>
            </div>

            <div className=\"bg-white rounded-lg shadow p-6\">
              <div className=\"flex items-center\">
                <div className=\"p-3 rounded-full bg-green-100\">
                  <Activity className=\"h-6 w-6 text-green-600\" />
                </div>
                <div className=\"ml-4\">
                  <p className=\"text-sm font-medium text-gray-600\">Active Now</p>
                  <p className=\"text-2xl font-bold text-gray-900\">{stats.activeSessions}</p>
                </div>
              </div>
            </div>

            <div className=\"bg-white rounded-lg shadow p-6\">
              <div className=\"flex items-center\">
                <div className=\"p-3 rounded-full bg-purple-100\">
                  <Download className=\"h-6 w-6 text-purple-600\" />
                </div>
                <div className=\"ml-4\">
                  <p className=\"text-sm font-medium text-gray-600\">Completed</p>
                  <p className=\"text-2xl font-bold text-gray-900\">{stats.completedSessions}</p>
                </div>
              </div>
            </div>

            <div className=\"bg-white rounded-lg shadow p-6\">
              <div className=\"flex items-center\">
                <div className=\"p-3 rounded-full bg-orange-100\">
                  <TrendingUp className=\"h-6 w-6 text-orange-600\" />
                </div>
                <div className=\"ml-4\">
                  <p className=\"text-sm font-medium text-gray-600\">Success Rate</p>
                  <p className=\"text-2xl font-bold text-gray-900\">
                    {stats.totalSessions > 0 ? Math.round((stats.completedSessions / stats.totalSessions) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div className=\"bg-white rounded-lg shadow overflow-hidden\">
          <div className=\"px-6 py-4 border-b border-gray-200\">
            <h2 className=\"text-lg font-semibold text-gray-900\">Recent Sessions</h2>
          </div>
          <div className=\"overflow-x-auto\">
            <table className=\"min-w-full divide-y divide-gray-200\">
              <thead className=\"bg-gray-50\">
                <tr>
                  <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    Session ID
                  </th>
                  <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    URL
                  </th>
                  <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    Status
                  </th>
                  <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    Progress
                  </th>
                  <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    Assets
                  </th>
                  <th className=\"px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider\">
                    Started
                  </th>
                </tr>
              </thead>
              <tbody className=\"bg-white divide-y divide-gray-200\">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className=\"px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900\">
                      {session.id.slice(0, 8)}...
                    </td>
                    <td className=\"px-6 py-4 whitespace-nowrap text-sm text-gray-900 max-w-xs truncate\">
                      {session.url}
                    </td>
                    <td className=\"px-6 py-4 whitespace-nowrap\">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className=\"px-6 py-4 whitespace-nowrap text-sm text-gray-900\">
                      {session.progress}%
                    </td>
                    <td className=\"px-6 py-4 whitespace-nowrap text-sm text-gray-900\">
                      {session.assets}
                    </td>
                    <td className=\"px-6 py-4 whitespace-nowrap text-sm text-gray-500\">
                      {formatDate(session.startTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;