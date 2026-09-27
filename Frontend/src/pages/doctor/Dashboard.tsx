import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck2, Clock3, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';

const stats = [
  { label: 'Total Patients', value: '248', icon: Users },
  { label: "Today's Appointments", value: '08', icon: CalendarCheck2 },
  { label: 'Estimated Earnings', value: 'Rs. 84,000', icon: Clock3 },
];

const appointments = [
  { patient: 'Nethmi Jayasinghe', time: '09:00 AM', status: 'Confirmed' },
  { patient: 'Kasun Perera', time: '10:30 AM', status: 'Pending' },
  { patient: 'Tharushi Bandara', time: '01:15 PM', status: 'Completed' },
];

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#107393] to-[#147190] p-6 text-white shadow-xl">
        <h1 className="text-3xl font-bold">Good to see you, Dr. {user?.full_name || 'Doctor'}</h1>
        <p className="mt-2 text-white/90">Manage your availability, appointments, and patient care from one clean dashboard.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold text-black">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-[#107393]/10 p-3 text-[#107393]"><Icon className="h-6 w-6" /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold text-black">Today’s appointments</h2>
          <div className="mt-4 space-y-3">
            {appointments.map((appointment) => (
              <div key={`${appointment.patient}-${appointment.time}`} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-black">{appointment.patient}</p>
                  <p className="text-sm text-slate-500">{appointment.time}</p>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{appointment.status}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-black">Quick actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button onClick={() => navigate('/doctor/availability')} fullWidth>Manage Availability</Button>
            <Button variant="outline" onClick={() => navigate('/doctor/appointments')} fullWidth>View Schedule</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
