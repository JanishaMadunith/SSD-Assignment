import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/UI/Card';
import api from '../../services/api';

type AdminUser = {
  role?: string;
  status?: string;
};

type DoctorRecord = {
  approval_status?: 'pending' | 'approved' | 'rejected';
  available?: boolean;
};

export default function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersResponse, doctorsResponse] = await Promise.all([
        api.get('/auth/admin/users', { params: { page: 1, limit: 500 } }),
        api.get('/doctors/admin'),
      ]);

      setUsers(Array.isArray(usersResponse.data?.items) ? usersResponse.data.items : []);
      setDoctors(Array.isArray(doctorsResponse.data) ? doctorsResponse.data : []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Unable to load admin analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const metrics = useMemo(() => {
    const totalUsers = users.length;
    const activeUsers = users.filter((user) => user.status === 'active').length;
    const suspendedUsers = users.filter((user) => user.status === 'suspended').length;
    const totalDoctors = users.filter((user) => user.role === 'doctor').length;

    const pendingVerifications = doctors.filter((doctor) => doctor.approval_status === 'pending').length;
    const approvedDoctors = doctors.filter((doctor) => doctor.approval_status === 'approved').length;
    const rejectedDoctors = doctors.filter((doctor) => doctor.approval_status === 'rejected').length;
    const onlineDoctors = doctors.filter((doctor) => doctor.available).length;

    return {
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalDoctors,
      pendingVerifications,
      approvedDoctors,
      rejectedDoctors,
      onlineDoctors,
    };
  }, [users, doctors]);

  const cards = [
    { label: 'Total Users', value: metrics.totalUsers },
    { label: 'Active Users', value: metrics.activeUsers },
    { label: 'Suspended Users', value: metrics.suspendedUsers },
    { label: 'Doctors (Accounts)', value: metrics.totalDoctors },
    { label: 'Pending Doctor Verification', value: metrics.pendingVerifications },
    { label: 'Approved Doctors', value: metrics.approvedDoctors },
    { label: 'Rejected Doctors', value: metrics.rejectedDoctors },
    { label: 'Doctors Available', value: metrics.onlineDoctors },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#107393] to-[#147190] p-6 text-white shadow-xl">
        <h1 className="text-3xl font-bold">Admin Control Center</h1>
        <p className="mt-2 text-white/90">Live platform overview for user accounts and doctor verification pipeline.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-black">{loading ? '...' : card.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold text-black">Verification queue health</h2>
          <div className="mt-4 space-y-3 text-sm">
            <QueueBar label="Pending" value={metrics.pendingVerifications} total={Math.max(doctors.length, 1)} color="bg-amber-500" />
            <QueueBar label="Approved" value={metrics.approvedDoctors} total={Math.max(doctors.length, 1)} color="bg-emerald-500" />
            <QueueBar label="Rejected" value={metrics.rejectedDoctors} total={Math.max(doctors.length, 1)} color="bg-red-500" />
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-black">Admin activity tips</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="rounded-2xl border border-slate-200 p-4">Review pending doctor registrations daily to keep patient booking flow smooth.</div>
            <div className="rounded-2xl border border-slate-200 p-4">Suspend suspicious accounts quickly and add a suspension reason for audit traceability.</div>
            <div className="rounded-2xl border border-slate-200 p-4">Use user role changes carefully and keep at least one active admin account.</div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function QueueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / total) * 100)));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-slate-600">
        <span>{label}</span>
        <span className="font-semibold text-black">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
