import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';

type Slot = {
  id: string | number;
  day_of_week?: string | number | null;
  start_time?: string;
  end_time?: string;
  is_available?: boolean;
};

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function normalizeDayOfWeek(value: Slot['day_of_week']): string {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const dayName = days[value];
    return dayName ? dayName.toLowerCase() : '';
  }
  return '';
}

function unwrapSlots(payload: any): Slot[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export default function Availability() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ day_of_week: 'Monday', start_time: '09:00', end_time: '17:00' });

  const loadSlots = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/doctors/availability');
      setSlots(unwrapSlots(data));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to load availability');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSlots();
  }, []);

  const grouped = useMemo(() =>
    days.map((day) => ({
      day,
      slots: slots.filter((slot) => normalizeDayOfWeek(slot.day_of_week) === day.toLowerCase()),
    })),
    [slots]
  );

  const addSlot = async () => {
    try {
      setSaving(true);
      await api.post('/doctors/availability', form);
      toast.success('Availability slot added');
      await loadSlots();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to add slot');
    } finally {
      setSaving(false);
    }
  };

  const deactivateSlot = async (id: string | number) => {
    try {
      await api.put('/doctors/availability', { id, is_available: false });
      toast.success('Availability updated');
      await loadSlots();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to update slot');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-2xl font-bold text-black">Weekly Availability</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <select value={form.day_of_week} onChange={(event) => setForm({ ...form, day_of_week: event.target.value })} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
            {days.map((day) => <option key={day}>{day}</option>)}
          </select>
          <input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
          <input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} className="rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={addSlot} loading={saving}>Add Slot</Button></div>
      </Card>

      {loading ? (
        <Card>Loading availability...</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map((group) => (
            <Card key={group.day}>
              <h3 className="text-lg font-bold text-black">{group.day}</h3>
              <div className="mt-4 space-y-3">
                {group.slots.length === 0 ? (
                  <p className="text-sm text-slate-500">No slots set.</p>
                ) : group.slots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 text-sm">
                    <div>
                      <div className="font-semibold text-black">{slot.start_time} - {slot.end_time}</div>
                      <div className="text-slate-500">{slot.is_available ? 'Available' : 'Inactive'}</div>
                    </div>
                    <Button variant="danger" onClick={() => deactivateSlot(slot.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

