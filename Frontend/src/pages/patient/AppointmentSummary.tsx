import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import logo from '../../assert/2.png';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  StarIcon,
  DocumentArrowDownIcon,
  VideoCameraIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';

type AppointmentDetail = {
  id: string | number;
  doctor_name?: string;
  doctor?: { 
    full_name?: string;
    specialty?: string;
    qualification?: string;
    experience?: number;
    rating?: number;
  };
  appointment_time?: string;
  status?: string;
  payment_status?: string;
  consultation_fee?: number;
  specialty?: string;
  notes?: string;
  telemedicine_session_url?: string;
};

export default function AppointmentSummary() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const loadAppointment = async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/appointments/${id}`);
        setAppointment(data);
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'Unable to load appointment details');
        navigate('/patient/appointments');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadAppointment();
    }
  }, [id, navigate]);

  const handleDownloadReceipt = async () => {
    if (!appointment) return;

    try {
      setDownloading(true);
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595, 842]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const drawText = (text: string, x: number, y: number, isBold = false, size = 11) => {
        page.drawText(text, {
          x,
          y,
          size,
          font: isBold ? bold : font,
          color: rgb(0.1, 0.1, 0.1),
        });
      };

      const drawLine = (x1: number, y: number, x2: number) => {
        page.drawLine({
          start: { x: x1, y },
          end: { x: x2, y },
          thickness: 1,
          color: rgb(0.9, 0.9, 0.9),
        });
      };

      const doctorName = appointment.doctor_name || appointment.doctor?.full_name || 'Doctor';
      const appointmentDate = appointment.appointment_time
        ? parseISO(appointment.appointment_time)
        : null;
      const fee = Number(appointment.consultation_fee || 0);
      const specialty = appointment.specialty || appointment.doctor?.specialty || 'General consultation';

      // Header
      drawText('APPOINTMENT RECEIPT', 50, 790, true, 18);
      drawLine(50, 785, 545);

      // Receipt Info
      drawText(`Receipt ID: APT-${appointment.id}`, 50, 760);
      drawText(`Generated: ${format(new Date(), 'PPpp')}`, 50, 740);

      drawLine(50, 730, 545);

      // Appointment Details
      drawText('APPOINTMENT DETAILS', 50, 710, true, 12);
      drawText(`Doctor: ${doctorName}`, 50, 685);
      drawText(`Specialty: ${specialty}`, 50, 665);
      drawText(`Appointment Date & Time: ${appointmentDate ? format(appointmentDate, 'PPPP, p') : 'Pending'}`, 50, 645);
      drawText(`Status: ${(appointment.status || 'Scheduled').toUpperCase()}`, 50, 625);

      drawLine(50, 615, 545);

      // Doctor Information
      drawText('DOCTOR INFORMATION', 50, 595, true, 12);
      drawText(
        `Qualifications: ${appointment.doctor?.qualification || 'Not listed'}`,
        50,
        570
      );
      drawText(
        `Experience: ${appointment.doctor?.experience || 'N/A'} years`,
        50,
        550
      );
      drawText(
        `Rating: ${appointment.doctor?.rating || 'N/A'} / 5.0`,
        50,
        530
      );

      drawLine(50, 520, 545);

      // Payment Details
      drawText('PAYMENT DETAILS', 50, 500, true, 12);
      drawText(`Consultation Fee: Rs. ${fee.toLocaleString()}`, 50, 475);
      drawText(`Payment Status: ${(appointment.payment_status || 'Pending').toUpperCase()}`, 50, 455);

      drawLine(50, 445, 545);

      // Notes
      if (appointment.notes) {
        drawText('NOTES', 50, 425, true, 12);
        drawText(appointment.notes, 50, 400, false, 10);
      }

      // Footer
      drawText(
        'Thank you for choosing our platform. Please contact support if you have any questions.',
        50,
        100,
        false,
        9
      );

      const bytes = await pdfDoc.save();
      const bytesCopy = new Uint8Array(bytes.byteLength);
      bytesCopy.set(bytes);
      const blob = new Blob([bytesCopy.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `appointment-receipt-${appointment.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Receipt downloaded successfully');
    } catch (_error) {
      toast.error('Unable to generate receipt PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!appointment) return;

    try {
      setJoining(true);
      const { data } = await api.post(`/telemedicine/appointments/${appointment.id}/join`);
      const joinUrl = data?.join_url || data?.url || data?.session_url || appointment.telemedicine_session_url;

      if (joinUrl) {
        window.open(joinUrl, '_blank', 'noopener,noreferrer');
        toast.success('Opening telemedicine session');
      } else {
        toast.error('Session URL not available');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to join telemedicine session');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#107393] hover:text-[#0d5a75] transition"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Back
        </button>
        <Card>
          <div className="text-center text-slate-500">Loading appointment details...</div>
        </Card>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#107393] hover:text-[#0d5a75] transition"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Back
        </button>
        <Card>
          <div className="text-center text-slate-500">Appointment not found</div>
        </Card>
      </div>
    );
  }

  const doctorName = appointment.doctor_name || appointment.doctor?.full_name || 'Doctor';
  const specialty = appointment.specialty || appointment.doctor?.specialty || 'General consultation';
  const appointmentDate = appointment.appointment_time
    ? parseISO(appointment.appointment_time)
    : null;
  const fee = Number(appointment.consultation_fee || 0);
  const status = (appointment.status || 'Scheduled').toLowerCase();
  const isUpcoming = status.includes('upcoming') || status.includes('confirm');
  const isCompleted = status.includes('complete') || status.includes('done') || status.includes('past');
  const isCancelled = status.includes('cancel');
  const patientName = user?.full_name || 'Patient';
  const patientEmail = user?.email || 'N/A';
  const companyName = 'SUWAPIYASA.LK';
  const companyTagline = 'AI-Powered Telemedicine';
  const statusLabel = isUpcoming ? 'Upcoming' : isCompleted ? 'Completed' : isCancelled ? 'Cancelled' : 'Scheduled';
  const statusStyles = isUpcoming
    ? 'bg-blue-50 text-blue-700 ring-blue-100'
    : isCompleted
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : isCancelled
        ? 'bg-red-50 text-red-700 ring-red-100'
        : 'bg-amber-50 text-amber-700 ring-amber-100';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,115,147,0.12),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#eef6fa_100%)] p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-[#107393]/30 hover:text-[#107393]"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Appointments
        </button>

        <Card className="overflow-hidden border border-slate-200/80 bg-white shadow-xl shadow-slate-200/60">
          <div className="relative overflow-hidden bg-gradient-to-r from-[#0b5f79] via-[#107393] to-[#19a1b8] px-6 py-8 text-white sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_24%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                  <img src={logo} alt={companyName} className="h-12 w-12 rounded-xl object-cover" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/75">{companyTagline}</p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{companyName}</h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    Your appointment is confirmed. Review the details below, download the receipt, or join the session when it becomes available.
                  </p>
                </div>
              </div>

              <div className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold ring-1 ${statusStyles}`}>
                <CheckCircleIcon className="h-5 w-5" />
                {statusLabel}
              </div>
            </div>

            <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur ring-1 ring-white/15">
                <p className="text-xs uppercase tracking-wide text-white/70">Appointment ID</p>
                <p className="mt-1 text-lg font-bold">#{appointment.id}</p>
              </div>
              <div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur ring-1 ring-white/15">
                <p className="text-xs uppercase tracking-wide text-white/70">Doctor</p>
                <p className="mt-1 text-lg font-bold">{doctorName}</p>
              </div>
              <div className="rounded-2xl bg-white/12 px-4 py-3 backdrop-blur ring-1 ring-white/15">
                <p className="text-xs uppercase tracking-wide text-white/70">Appointment Time</p>
                <p className="mt-1 text-lg font-bold">{appointmentDate ? format(appointmentDate, 'PPpp') : 'Pending'}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
            <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <p>{companyName} · Professional healthcare services</p>
              <p>Generated {format(new Date(), 'PPpp')}</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Main Details */}
          <div className="space-y-6 lg:col-span-2">
            {/* Patient Information */}
            <Card className="border border-slate-200/80 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#107393]">Patient Information</p>
                  <h3 className="mt-1 text-xl font-bold text-black">{patientName}</h3>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#107393]/10">
                  <UserIcon className="h-5 w-5 text-[#107393]" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Patient Name</p>
                    <p className="mt-1 text-lg font-bold text-black">{patientName}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Patient ID</p>
                    <p className="mt-1 font-semibold text-black">{user?.id || 'N/A'}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Email Address</p>
                  <div className="mt-1 flex items-center gap-2">
                    <EnvelopeIcon className="h-4 w-4 text-slate-500" />
                    <p className="font-semibold text-black">{patientEmail}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Appointment Details */}
            <Card className="border border-slate-200/80 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#107393]">Appointment Details</p>
                  <h3 className="mt-1 text-xl font-bold text-black">Session overview</h3>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <div className="space-y-4">
                {/* Date & Time */}
                <div className="rounded-2xl border border-[#107393]/20 bg-gradient-to-br from-[#107393]/8 to-white p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#107393]/10">
                      <ClockIcon className="h-6 w-6 text-[#107393]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">Date & Time</p>
                      <p className="mt-1 text-xl font-bold text-black">
                        {appointmentDate ? format(appointmentDate, 'PPPP') : 'Date pending'}
                      </p>
                      <p className="text-lg font-semibold text-[#107393]">
                        {appointmentDate ? format(appointmentDate, 'p') : 'Time pending'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Appointment Status</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`inline-block h-3 w-3 rounded-full ${
                        isUpcoming
                          ? 'bg-blue-500'
                          : isCompleted
                            ? 'bg-emerald-500'
                            : isCancelled
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                      }`}
                    />
                    <p className="font-bold text-black">{appointment.status || 'Scheduled'}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Doctor Information */}
            <Card className="border border-slate-200/80 shadow-sm">
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#107393]">Doctor Information</p>
                  <h3 className="mt-1 text-xl font-bold text-black">Consultation partner</h3>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-100">
                  <UserIcon className="h-5 w-5 text-purple-600" />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Doctor Name</p>
                  <p className="mt-1 text-2xl font-bold text-black">{doctorName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Specialization</p>
                  <p className="mt-1 text-lg font-semibold text-[#107393]">{specialty}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Qualifications</p>
                    <p className="mt-1 font-semibold text-black">{appointment.doctor?.qualification || 'Not listed'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Experience</p>
                    <p className="mt-1 font-semibold text-black">{appointment.doctor?.experience || 'N/A'} years</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Rating</p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <StarIcon
                          key={i}
                          className={`h-4 w-4 ${
                            i < Math.floor(appointment.doctor?.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="font-bold text-black">{appointment.doctor?.rating || 'N/A'} / 5.0</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Notes */}
            {appointment.notes && (
              <Card className="border border-slate-200/80 shadow-sm">
                <div className="mb-3 border-b border-slate-200 pb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Notes</p>
                </div>
                <p className="text-slate-700">{appointment.notes}</p>
              </Card>
            )}
          </div>

          {/* Right Column - Amount & Actions */}
          <div className="space-y-6">
            {/* Amount Card */}
            <Card className="border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white shadow-sm">
              <div className="mb-6 text-center">
                <p className="text-xs font-semibold text-slate-500 uppercase">Consultation Fee</p>
                <h2 className="mt-2 text-4xl font-bold text-emerald-600">Rs. {fee.toLocaleString()}</h2>
              </div>

              <div className="mb-6 space-y-2 border-t border-b border-slate-200 py-4">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-semibold text-black">Rs. {fee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-semibold text-black">Rs. 0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tax (0%)</span>
                  <span className="font-semibold text-black">Rs. 0</span>
                </div>
              </div>

              <div className="mb-6 flex justify-between rounded-lg bg-[#107393]/10 p-4">
                <span className="font-bold text-black">Total Amount</span>
                <span className="text-2xl font-bold text-[#107393]">Rs. {fee.toLocaleString()}</span>
              </div>

              <div className="rounded-2xl bg-emerald-100 p-4 text-center">
                <p className="text-xs font-semibold text-emerald-700 uppercase">Payment Status</p>
                <p className="mt-2 text-lg font-bold text-emerald-600">✓ {appointment.payment_status || 'Paid'}</p>
              </div>
            </Card>

            {/* Actions */}
            <Card className="border border-slate-200/80 shadow-sm">
              <div className="space-y-3">
                {isUpcoming && (
                  <Button
                    fullWidth
                    onClick={handleJoinSession}
                    loading={joining}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <VideoCameraIcon className="h-5 w-5" />
                    Join Session
                  </Button>
                )}

                <Button
                  fullWidth
                  variant="outline"
                  onClick={handleDownloadReceipt}
                  loading={downloading}
                  className="flex items-center justify-center gap-2"
                >
                  <DocumentArrowDownIcon className="h-5 w-5" />
                  Download Receipt
                </Button>

                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => navigate('/patient/appointments')}
                >
                  Back to Appointments
                </Button>
              </div>
            </Card>

            {/* Reminder */}
            <Card className="border border-amber-200 bg-amber-50">
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase">⚠️ Reminder</p>
                <p className="mt-2 text-sm text-amber-900">
                  Please join 5 minutes before the scheduled time. Keep your ID and medical records ready.
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <Card className="border border-slate-200/80 bg-white/80 text-center shadow-sm">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <img src={logo} alt={companyName} className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            <div>
              <p className="text-sm font-semibold text-black">{companyName}</p>
              <p className="text-xs text-slate-500">{companyTagline}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Thank you for booking with {companyName}. For inquiries, contact our support team.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            © 2026 {companyName}. All rights reserved.
          </p>
        </Card>
      </div>
    </div>
  );
}
