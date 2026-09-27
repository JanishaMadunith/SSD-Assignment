import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FileText, Syringe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';

const stats = [
  { label: 'Upcoming Appointments', value: '03', icon: CalendarDays },
  { label: 'Medical Reports', value: '12', icon: FileText },
  { label: 'Prescriptions', value: '04', icon: Syringe },
];

const appointments = [
  { doctor: 'Dr. Nimal Perera', specialty: 'General Medicine', time: 'Today, 10:30 AM', status: 'Confirmed' },
  { doctor: 'Dr. Ayesha Fernando', specialty: 'Dermatology', time: 'Tomorrow, 02:00 PM', status: 'Pending' },
  { doctor: 'Dr. Kavinda Silva', specialty: 'Cardiology', time: 'Fri, 09:15 AM', status: 'Confirmed' },
];

const statusStyles: Record<string, string> = {
  Confirmed: 'bg-[#107393]/15 text-[#107393] border border-[#107393]/30',
  Pending: 'bg-[#ff347d]/15 text-[#9d0063] border border-[#ff347d]/35',
};

export default function PatientDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="space-y-6 rounded-3xl bg-[#ecf3f5] p-4 sm:p-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#107393] via-[#147190] to-[#39bee5] p-6 text-white shadow-xl shadow-[#107393]/25">
        <h1 className="text-3xl font-bold text-[#ecf3f5]">Welcome back, {user?.full_name || 'Patient'}</h1>
        <p className="mt-2 max-w-2xl text-[#ecf3f5]">Your care journey is organized and ready. Book appointments, review records, and stay connected with your doctors.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-[#39bee5]/20 bg-white shadow-[#107393]/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#737373]">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold text-[#000000]">{item.value}</p>
                </div>
                <div className="rounded-2xl bg-[#39bee5]/20 p-3 text-[#147190]"><Icon className="h-6 w-6" /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-[#39bee5]/20 bg-white">
          <h2 className="text-xl font-bold text-[#000000]">Quick actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button onClick={() => navigate('/patient/search')} fullWidth className="!bg-[#107393] !text-[#ecf3f5] hover:!bg-[#147190]">
              Book Appointment
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/patient/symptom-checker')}
              fullWidth
              className="!border-[#9d0063]/25 !text-[#9d0063] hover:!bg-[#ff347d]/10"
            >
              Symptom Checker
            </Button>
          </div>
        </Card>

        <Card className="border-[#39bee5]/20 bg-white">
          <h2 className="text-xl font-bold text-[#000000]">Health summary</h2>
          <p className="mt-2 text-sm text-[#737373]">Mock data is shown here for the foundation stage. Connect live analytics next.</p>
          <div className="mt-4 space-y-3">
            <div className="h-3 rounded-full bg-[#ecf3f5]"><div className="h-3 w-4/5 rounded-full bg-[#107393]" /></div>
            <div className="h-3 rounded-full bg-[#ecf3f5]"><div className="h-3 w-3/5 rounded-full bg-[#39bee5]" /></div>
            <div className="h-3 rounded-full bg-[#ecf3f5]"><div className="h-3 w-1/2 rounded-full bg-[#9d0063]" /></div>
          </div>
        </Card>
      </div>

      <Card className="border-[#39bee5]/20 bg-white">
        <h2 className="text-xl font-bold text-[#000000]">Recent appointments</h2>
        <div className="mt-4 space-y-4">
          {appointments.map((appointment) => (
            <div
              key={`${appointment.doctor}-${appointment.time}`}
              className="flex flex-col gap-2 rounded-2xl border border-[#39bee5]/25 bg-[#ecf3f5]/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-[#000000]">{appointment.doctor}</p>
                <p className="text-sm text-[#737373]">{appointment.specialty}</p>
              </div>
              <div className="text-sm text-[#147190]">{appointment.time}</div>
              <div className={`rounded-full px-3 py-1 text-sm font-semibold ${statusStyles[appointment.status] || statusStyles.Confirmed}`}>
                {appointment.status}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
