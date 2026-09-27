import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';
import api from '../services/api';

type DoctorApplicationForm = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  specialty: string;
  qualification: string;
  consultation_fee: string;
  experience: string;
  license_number: string;
  bio: string;
};

const initialForm: DoctorApplicationForm = {
  full_name: '',
  email: '',
  password: '',
  phone: '',
  specialty: '',
  qualification: '',
  consultation_fee: '',
  experience: '',
  license_number: '',
  bio: '',
};

export default function DoctorApplication() {
  const navigate = useNavigate();
  const [form, setForm] = useState<DoctorApplicationForm>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof DoctorApplicationForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Doctor Registration | SUWAPIYASA.LK';
  }, []);

  const feeValue = useMemo(() => Number(form.consultation_fee || 0), [form.consultation_fee]);

  const updateField = <K extends keyof DoctorApplicationForm>(field: K, value: DoctorApplicationForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof DoctorApplicationForm, string>> = {};

    if (!form.full_name.trim()) nextErrors.full_name = 'Full name is required';
    if (!form.email.trim()) nextErrors.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = 'Enter a valid email';
    if (!form.password || form.password.length < 6) nextErrors.password = 'Minimum 6 characters';
    if (!form.phone.trim()) nextErrors.phone = 'Phone number is required';
    if (!form.specialty.trim()) nextErrors.specialty = 'Specialty is required';
    if (!form.qualification.trim()) nextErrors.qualification = 'Qualification is required';
    if (!form.consultation_fee.trim() || Number.isNaN(feeValue) || feeValue <= 0) nextErrors.consultation_fee = 'Enter a valid consultation fee';
    if (!form.experience.trim() || Number.isNaN(Number(form.experience)) || Number(form.experience) < 0) nextErrors.experience = 'Enter valid experience years';
    if (!form.license_number.trim()) nextErrors.license_number = 'License number is required';
    if (!form.bio.trim()) nextErrors.bio = 'Short bio is required';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);

      const { data: registration } = await api.post('/auth/register', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: 'doctor',
      });

      const token = registration?.token;
      if (!token) {
        throw new Error('Doctor registration token was not returned');
      }

      const doctorPayload = {
        specialty: form.specialty,
        qualification: form.qualification,
        consultation_fee: Number(form.consultation_fee),
        phone: form.phone,
        experience: Number(form.experience),
        license_number: form.license_number,
        bio: form.bio,
      };

      await api.put('/doctors/profile', doctorPayload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success('Doctor application submitted for admin approval');
      navigate('/login', { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Unable to submit doctor application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 px-4 py-12">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#0b5f79] to-[#107393] p-8 text-white shadow-2xl">
          <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/85">Doctor onboarding</span>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Join With Us As a Doctor</h1>
          <p className="mt-4 max-w-xl text-white/85">
            Complete your application below. Your details will be reviewed by the admin team, and once approved you can manage your doctor account and handle appointments.
          </p>

          <div className="mt-8 space-y-3 text-sm text-white/90">
            <div className="rounded-2xl bg-white/10 px-4 py-3">1. Submit your professional details</div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">2. Admin reviews and approves your profile</div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">3. Start managing appointments and availability</div>
          </div>

          <div className="mt-8 rounded-2xl bg-white/10 p-4 text-sm text-white/85">
            Already applied?{' '}
            <Link className="font-semibold text-white underline underline-offset-4" to="/login">
              Sign in here
            </Link>
          </div>
        </Card>

        <Card className="border border-slate-200/80 bg-white shadow-xl">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" error={errors.full_name}>
                <input value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} className={inputClass} placeholder="Dr. Your Name" />
              </Field>
              <Field label="Email" error={errors.email}>
                <input value={form.email} onChange={(e) => updateField('email', e.target.value)} className={inputClass} placeholder="you@example.com" type="email" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password" error={errors.password}>
                <input value={form.password} onChange={(e) => updateField('password', e.target.value)} className={inputClass} placeholder="Minimum 6 characters" type="password" />
              </Field>
              <Field label="Phone" error={errors.phone}>
                <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} className={inputClass} placeholder="+94..." />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Specialty" error={errors.specialty}>
                <input value={form.specialty} onChange={(e) => updateField('specialty', e.target.value)} className={inputClass} placeholder="Cardiology" />
              </Field>
              <Field label="Qualification" error={errors.qualification}>
                <input value={form.qualification} onChange={(e) => updateField('qualification', e.target.value)} className={inputClass} placeholder="MBBS, MD" />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Consultation fee" error={errors.consultation_fee}>
                <input value={form.consultation_fee} onChange={(e) => updateField('consultation_fee', e.target.value)} className={inputClass} placeholder="4500" inputMode="numeric" />
              </Field>
              <Field label="Experience (years)" error={errors.experience}>
                <input value={form.experience} onChange={(e) => updateField('experience', e.target.value)} className={inputClass} placeholder="8" inputMode="numeric" />
              </Field>
            </div>

            <div className="grid gap-4">
              <Field label="License number" error={errors.license_number}>
                <input value={form.license_number} onChange={(e) => updateField('license_number', e.target.value)} className={inputClass} placeholder="SLMC / registration number" />
              </Field>

              <Field label="Short bio" error={errors.bio}>
                <textarea value={form.bio} onChange={(e) => updateField('bio', e.target.value)} className={`${inputClass} min-h-[120px]`} placeholder="Tell us about your clinical background and approach to care." />
              </Field>
            </div>

            <Button type="submit" loading={submitting} fullWidth>
              Submit doctor application
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20';
