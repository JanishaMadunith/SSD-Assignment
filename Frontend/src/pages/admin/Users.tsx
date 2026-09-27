import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import api from '../../services/api';

type UserRole = 'patient' | 'doctor' | 'admin';
type UserStatus = 'active' | 'suspended' | 'deleted';

type AdminUser = {
  id: number;
  email: string;
  full_name?: string;
  role: UserRole;
  status: UserStatus;
  created_at?: string;
  updated_at?: string;
  suspension_reason?: string;
};

type UserListResponse = {
  items?: AdminUser[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

function unwrapUsers(payload: UserListResponse | AdminUser[]): AdminUser[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export default function Users() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [actionUserId, setActionUserId] = useState<number | null>(null);

  const loadUsers = async (useRefresh = false) => {
    try {
      if (useRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params: Record<string, string | number> = { page: 1, limit: 200 };
      if (query.trim()) params.query = query.trim();
      if (roleFilter !== 'all') params.role = roleFilter;
      if (statusFilter !== 'all') params.status = statusFilter;

      const { data } = await api.get('/auth/admin/users', { params });
      setUsers(unwrapUsers(data));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const totals = {
      all: users.length,
      active: users.filter((user) => user.status === 'active').length,
      suspended: users.filter((user) => user.status === 'suspended').length,
      admins: users.filter((user) => user.role === 'admin').length,
    };

    return totals;
  }, [users]);

  const updateStatus = async (user: AdminUser, status: 'active' | 'suspended') => {
    try {
      setActionUserId(user.id);
      const reason = status === 'suspended' ? window.prompt('Reason for suspension (optional):') || '' : '';
      await api.patch(`/auth/admin/users/${user.id}/status`, { status, reason });
      toast.success(status === 'suspended' ? 'User suspended' : 'User reactivated');
      await loadUsers(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update user status');
    } finally {
      setActionUserId(null);
    }
  };

  const updateRole = async (user: AdminUser, role: UserRole) => {
    try {
      setActionUserId(user.id);
      await api.patch(`/auth/admin/users/${user.id}/role`, { role });
      toast.success('User role updated');
      await loadUsers(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to update role');
    } finally {
      setActionUserId(null);
    }
  };

  const softDeleteUser = async (user: AdminUser) => {
    const confirmed = window.confirm(`Soft-delete ${user.full_name || user.email}?`);
    if (!confirmed) return;

    try {
      setActionUserId(user.id);
      await api.delete(`/auth/admin/users/${user.id}`);
      toast.success('User soft deleted');
      await loadUsers(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to delete user');
    } finally {
      setActionUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-black">User Management</h2>
            <p className="mt-1 text-sm text-slate-600">Manage user roles, account status, and lifecycle actions from a single panel.</p>
          </div>
          <Button onClick={() => loadUsers(true)} loading={refreshing}>Refresh</Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatCard label="Total Users" value={stats.all} />
          <StatCard label="Active" value={stats.active} />
          <StatCard label="Suspended" value={stats.suspended} />
          <StatCard label="Admins" value={stats.admins} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#107393]"
          />
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as 'all' | UserRole)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#107393]"
          >
            <option value="all">All roles</option>
            <option value="patient">Patient</option>
            <option value="doctor">Doctor</option>
            <option value="admin">Admin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | UserStatus)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#107393]"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <div className="mt-3">
          <Button onClick={() => loadUsers(true)} variant="outline">Apply Filters</Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-3">Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th className="min-w-[290px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">No users found.</td>
                </tr>
              ) : (
                users.map((user) => {
                  const busy = actionUserId === user.id;
                  const badgeClass =
                    user.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : user.status === 'suspended'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-red-50 text-red-700';

                  return (
                    <tr key={user.id} className="border-b border-slate-100 align-top">
                      <td className="py-3 font-medium text-black">{user.full_name || 'Unnamed user'}</td>
                      <td className="text-slate-700">{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          disabled={busy || user.status === 'deleted'}
                          onChange={(event) => updateRole(user, event.target.value as UserRole)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#107393] disabled:opacity-60"
                        >
                          <option value="patient">Patient</option>
                          <option value="doctor">Doctor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                          {user.status}
                        </span>
                        {user.suspension_reason && (
                          <p className="mt-2 max-w-[220px] text-xs text-slate-500">Reason: {user.suspension_reason}</p>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {user.status !== 'deleted' && (
                            <Button
                              variant={user.status === 'suspended' ? 'secondary' : 'outline'}
                              className="px-3 py-2 text-xs"
                              loading={busy}
                              onClick={() => updateStatus(user, user.status === 'suspended' ? 'active' : 'suspended')}
                            >
                              {user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            className="px-3 py-2 text-xs"
                            loading={busy}
                            disabled={user.status === 'deleted'}
                            onClick={() => softDeleteUser(user)}
                          >
                            Soft Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-black">{value}</p>
    </div>
  );
}
