import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';

type Appointment = {
  id: string | number;
  doctor_name?: string;
  doctor?: { full_name?: string };
  appointment_time?: string;
  status?: string;
  payment_status?: string;
  consultation_fee?: number;
  specialty?: string;
  notes?: string;
  telemedicine_session_url?: string;
};

const tabs = ['Upcoming', 'Past', 'Cancelled'] as const;

function unwrapAppointments(payload: any): Appointment[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function categorize(appointment: Appointment) {
  const status = (appointment.status || '').toLowerCase();
  if (status.includes('cancel')) return 'Cancelled';
  if (status.includes('complete') || status.includes('done') || status.includes('past')) return 'Past';
  return 'Upcoming';
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Upcoming');
  const [actionId, setActionId] = useState<string | number | null>(null);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/appointments/patient');
      setAppointments(unwrapAppointments(data));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const filtered = useMemo(
    () => appointments.filter((appointment) => categorize(appointment) === activeTab),
    [activeTab, appointments]
  );

  const handleCancel = async (id: string | number) => {
    try {
      setActionId(id);
      await api.put(`/appointments/${id}/cancel`);
      toast.success('Appointment cancelled');
      await loadAppointments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to cancel appointment');
    } finally {
      setActionId(null);
    }
  };

  const handleJoin = async (id: string | number) => {
    try {
      setActionId(id);
      const { data } = await api.post(`/telemedicine/appointments/${id}/join`);
      const joinUrl = data?.join_url || data?.url || data?.session_url;
      if (joinUrl) {
        window.open(joinUrl, '_blank', 'noopener,noreferrer');
      }
      toast.success('Telemedicine session opened');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to join telemedicine session');
    } finally {
      setActionId(null);
    }
  };



  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200',
                activeTab === tab ? 'bg-[#107393] text-white shadow-lg shadow-[#107393]/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card>Loading appointments...</Card>
        ) : filtered.length === 0 ? (
          <Card>
            <p className="text-center text-slate-500">No {activeTab.toLowerCase()} appointments found.</p>
          </Card>
        ) : (
          filtered.map((appointment) => {
            const date = appointment.appointment_time ? parseISO(appointment.appointment_time) : null;
            const doctorName = appointment.doctor_name || appointment.doctor?.full_name || 'Doctor';

            return (
              <Card key={appointment.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-black">{doctorName}</h3>
                      <span className="rounded-full bg-[#107393]/10 px-3 py-1 text-xs font-semibold text-[#107393]">{appointment.status || 'Scheduled'}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{appointment.specialty || 'General consultation'}</p>
                    <p className="mt-1 text-sm text-slate-600">{date ? format(date, 'PPpp') : appointment.appointment_time || 'Date pending'}</p>
                    {appointment.notes && <p className="mt-2 text-sm text-slate-600">{appointment.notes}</p>}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {(appointment.status || '').toLowerCase().includes('confirm') && (
                      <Button onClick={() => handleJoin(appointment.id)} loading={actionId === appointment.id}>Join</Button>
                    )}
                    {(appointment.status || '').toLowerCase().includes('pending') && (
                      <Button variant="outline" onClick={() => handleCancel(appointment.id)} loading={actionId === appointment.id}>Cancel</Button>
                    )}
                    {(appointment.status || '').toLowerCase().includes('upcoming') && (
                      <Button variant="outline" onClick={() => handleCancel(appointment.id)} loading={actionId === appointment.id}>Cancel</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

