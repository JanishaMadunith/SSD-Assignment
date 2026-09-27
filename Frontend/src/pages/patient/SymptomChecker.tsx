import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import api from '../../services/api';

type Message = { id: number; role: 'user' | 'ai'; text: string };

type AIAnalysis = {
  replyText: string;
  probableConditions: string[];
  redFlags: string[];
  triageLevel: 'low' | 'medium' | 'high' | 'emergency' | string;
  recommendedSpecialty: string;
  followUpQuestions: string[];
  disclaimer?: string;
};

type DoctorRecommendation = {
  doctorId: number;
  doctorName?: string;
  specialty?: string;
  qualification?: string;
  rating?: number;
  consultationFee?: string | number;
  available?: boolean;
  nextSlots?: Array<{
    date: string;
    startTime: string;
    endTime: string;
  }>;
};

type CheckerResponse = {
  analysis: AIAnalysis;
  recommendations?: {
    requestedSpecialty?: string;
    recommendations?: DoctorRecommendation[];
  };
};

const quickSymptoms = ['Fever', 'Headache', 'Cough', 'Stomach pain', 'Rash', 'Dizziness'];

const triageStyles: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  emergency: 'bg-red-100 text-red-800',
};

export default function SymptomChecker() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'ai', text: 'Hello, I am your symptom assistant. Describe how you feel, and I will suggest possible next steps.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookingSlotKey, setBookingSlotKey] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [recommendedDoctors, setRecommendedDoctors] = useState<DoctorRecommendation[]>([]);
  const defaultSeverity = 3;

  const suggestions = useMemo(() => quickSymptoms, []);

  const formatSlotLabel = (slot: { date: string; startTime: string; endTime: string }) => {
    const start = new Date(`${slot.date}T${slot.startTime}:00`);
    const end = new Date(`${slot.date}T${slot.endTime}:00`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return `${slot.date} ${slot.startTime}-${slot.endTime}`;
    }

    return `${new Intl.DateTimeFormat('en-LK', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(start)} • ${new Intl.DateTimeFormat('en-LK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(start)}-${new Intl.DateTimeFormat('en-LK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(end)}`;
  };

  const bookFromChatbot = async (doctorId: number, slot: { date: string; startTime: string }) => {
    const appointment_time = `${slot.date}T${slot.startTime}:00`;
    const slotKey = `${doctorId}-${appointment_time}`;

    try {
      setBookingSlotKey(slotKey);
      await api.post('/appointments/', {
        doctor_id: doctorId,
        appointment_time,
      });

      toast.success('Appointment booked successfully from AI assistant');
      navigate('/patient/appointments');
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Failed to book appointment';
      toast.error(message);
    } finally {
      setBookingSlotKey(null);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { id: Date.now(), role: 'user', text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');

    const conversationHistory = nextMessages.slice(-8).map((messageItem) => ({
      role: messageItem.role === 'ai' ? 'assistant' : 'user',
      content: messageItem.text,
    }));

    try {
      setLoading(true);
      const { data } = await api.post<CheckerResponse>('/ai-symptom/chat/message', {
        message: text,
        severity: defaultSeverity,
        conversationHistory,
        patientContext: {
          channel: 'patient-dashboard',
        },
      });

      const aiReply = data?.analysis?.replyText || 'I could not analyze this right now. Please try again.';

      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: 'ai', text: aiReply },
      ]);

      setAnalysis(data.analysis || null);
      setRecommendedDoctors(data.recommendations?.recommendations || []);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.message || 'Failed to get symptom analysis';
      toast.error(message);
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: 'ai', text: 'I am having trouble right now. Please try again in a moment.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="flex h-[75vh] min-h-[560px] max-h-[760px] flex-col overflow-hidden">
        <div className="mb-4 border-b border-slate-200 pb-4">
          <h2 className="text-2xl font-bold text-black">AI Symptom Checker</h2>
          <p className="mt-1 text-sm text-slate-600">This assistant is for guidance only and does not replace a doctor.</p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div key={message.id} className={['flex', message.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
              <div className={['max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm', message.role === 'user' ? 'bg-[#107393] text-white' : 'bg-slate-100 text-slate-800'].join(' ')}>
                {message.text}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => sendMessage(item)}
                disabled={loading}
                className="rounded-full bg-[#107393]/5 px-3 py-2 text-sm font-medium text-[#107393] transition-all duration-200 hover:bg-[#107393]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && !loading && sendMessage(input)}
              placeholder="Describe your symptoms..."
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20"
            />
            <Button onClick={() => sendMessage(input)} loading={loading}>
              Send
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <h3 className="text-lg font-bold text-black">AI clinical summary</h3>

          {analysis ? (
            <div className="mt-3 space-y-4 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Triage level</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${triageStyles[analysis.triageLevel] || triageStyles.medium}`}>
                  {analysis.triageLevel}
                </span>
              </div>

              <div>
                <p className="font-semibold text-black">Recommended specialty</p>
                <p>{analysis.recommendedSpecialty || 'General medicine'}</p>
              </div>

              <div>
                <p className="font-semibold text-black">Possible conditions</p>
                <ul className="mt-1 space-y-1">
                  {(analysis.probableConditions || []).slice(0, 3).map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-semibold text-black">Red flags</p>
                <ul className="mt-1 space-y-1 text-red-700">
                  {(analysis.redFlags || []).length ? (
                    analysis.redFlags.slice(0, 3).map((item) => <li key={item}>• {item}</li>)
                  ) : (
                    <li>• No immediate red flags detected.</li>
                  )}
                </ul>
              </div>

              <p className="text-xs text-slate-500">{analysis.disclaimer}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Send symptoms to receive AI triage, caution flags, and doctor matching.</p>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-black">Recommended doctors</h3>
          {recommendedDoctors.length ? (
            <div className="mt-3 space-y-3">
              {recommendedDoctors.slice(0, 3).map((doctor) => (
                <div key={doctor.doctorId} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-semibold text-black">{doctor.doctorName || `Doctor #${doctor.doctorId}`}</p>
                  <p className="text-sm text-slate-600">{doctor.specialty || 'General medicine'}</p>
                  <p className="text-sm text-slate-500">{doctor.qualification || 'Qualification not available'}</p>
                  <div className="mt-2 text-xs text-slate-500">
                    Fee: Rs. {Number(doctor.consultationFee || 0).toLocaleString()} | Rating: {Number(doctor.rating || 0).toFixed(1)}
                  </div>

                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Available slots</p>
                    {doctor.nextSlots && doctor.nextSlots.length > 0 ? (
                      <div className="space-y-2">
                        {doctor.nextSlots.slice(0, 3).map((slot) => {
                          const slotKey = `${doctor.doctorId}-${slot.date}T${slot.startTime}:00`;

                          return (
                            <Button
                              key={slotKey}
                              variant="outline"
                              fullWidth
                              loading={bookingSlotKey === slotKey}
                              onClick={() => bookFromChatbot(doctor.doctorId, slot)}
                              className="!justify-start !text-left"
                            >
                              {formatSlotLabel(slot)}
                            </Button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No upcoming slots published by this doctor yet.</p>
                    )}
                  </div>
                </div>
              ))}

              <Button variant="outline" fullWidth onClick={() => navigate('/patient/search')}>
                Book Appointment
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Doctor suggestions will appear after analysis.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

