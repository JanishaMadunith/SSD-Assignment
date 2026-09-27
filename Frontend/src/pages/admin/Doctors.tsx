import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import api from '../../services/api';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

type DoctorRecord = {
  id: number;
  user_id: number;
  full_name?: string;
  email?: string;
  specialty?: string;
  qualification?: string;
  consultation_fee?: number;
  rating?: number;
  available?: boolean;
  approval_status: ApprovalStatus;
  verification_notes?: string;
  verification_documents?: unknown[];
  reviewed_by?: number;
  reviewed_at?: string;
};

function unwrapDoctors(payload: any): DoctorRecord[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export default function Doctors() {
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('all');
  const [actionId, setActionId] = useState<number | null>(null);

  const loadDoctors = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (query.trim()) params.query = query.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/doctors/admin', { params });
      setDoctors(unwrapDoctors(data));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    return {
      total: doctors.length,
      pending: doctors.filter((doctor) => doctor.approval_status === 'pending').length,
      approved: doctors.filter((doctor) => doctor.approval_status === 'approved').length,
      rejected: doctors.filter((doctor) => doctor.approval_status === 'rejected').length,
    };
  }, [doctors]);

  const updateVerification = async (doctor: DoctorRecord, status: ApprovalStatus) => {
    try {
      setActionId(doctor.id);
      const notes = window.prompt(`Add notes for ${status} (optional):`) || '';
      await api.patch(`/doctors/admin/${doctor.id}/verification`, { status, notes });
      toast.success(`Doctor ${status}`);
      await loadDoctors();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to update verification status');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-black">Doctor Verification</h2>
            <p className="mt-1 text-sm text-slate-600">Review doctor profiles, approve or reject registrations, and track verification decisions.</p>
          </div>
          <Button onClick={loadDoctors} loading={loading}>Refresh</Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <MetricCard label="Total" value={stats.total} />
          <MetricCard label="Pending" value={stats.pending} />
          <MetricCard label="Approved" value={stats.approved} />
          <MetricCard label="Rejected" value={stats.rejected} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by doctor, email, specialty"
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#107393]"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | ApprovalStatus)}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#107393]"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <Button variant="outline" onClick={loadDoctors}>Apply Filters</Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <Card>
            <p className="text-center text-slate-500">Loading doctors...</p>
          </Card>
        ) : doctors.length === 0 ? (
          <Card>
            <p className="text-center text-slate-500">No doctors found.</p>
          </Card>
        ) : (
          doctors.map((doctor) => {
            const busy = actionId === doctor.id;
            const statusStyle =
              doctor.approval_status === 'approved'
                ? 'bg-emerald-50 text-emerald-700'
                : doctor.approval_status === 'rejected'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700';

            return (
              <Card key={doctor.id} className="border border-slate-200/80">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-black">{doctor.full_name || `Doctor #${doctor.id}`}</h3>
                    <p className="text-sm text-slate-500">{doctor.email || 'No email'}</p>
                    <p className="mt-1 text-sm font-medium text-[#107393]">{doctor.specialty || 'Specialty not set'}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusStyle}`}>
                    {doctor.approval_status}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-700">Qualification:</span> {doctor.qualification || 'Not listed'}</p>
                  <p><span className="font-semibold text-slate-700">Fee:</span> Rs. {Number(doctor.consultation_fee || 0).toLocaleString()}</p>
                  <p><span className="font-semibold text-slate-700">Rating:</span> {Number(doctor.rating || 0).toFixed(1)}</p>
                  <p><span className="font-semibold text-slate-700">Availability:</span> {doctor.available ? 'Available' : 'Unavailable'}</p>
                  <p><span className="font-semibold text-slate-700">Documents:</span> {Array.isArray(doctor.verification_documents) ? doctor.verification_documents.length : 0}</p>
                </div>

                {doctor.verification_notes && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    <p className="text-xs font-semibold uppercase text-slate-500">Last review note</p>
                    <p className="mt-1">{doctor.verification_notes}</p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    className="px-3 py-2 text-xs"
                    loading={busy}
                    onClick={() => updateVerification(doctor, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    className="px-3 py-2 text-xs"
                    loading={busy}
                    onClick={() => updateVerification(doctor, 'rejected')}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    className="px-3 py-2 text-xs"
                    loading={busy}
                    onClick={() => updateVerification(doctor, 'pending')}
                  >
                    Set Pending
                  </Button>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-black">{value}</p>
    </div>
  );
}
