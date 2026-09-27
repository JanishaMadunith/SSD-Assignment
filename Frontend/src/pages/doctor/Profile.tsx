import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, Hospital, Languages, LogOut, Mail, Phone, ShieldCheck, Stethoscope, Upload, UserRound, BadgeInfo } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { useAuth } from '../../context/AuthContext';
import { completionPercent, formatTimestamp, loadStoredJson, saveStoredJson } from '../../utils/profile';

const DOCTOR_PROFILE_UI_KEY = 'suwapiyasa_doctor_profile_ui';

const specialties = [
  'Cardiology', 'Dermatology', 'ENT', 'Family Medicine', 'General Medicine', 'Gynecology', 'Neurology',
  'Orthopedics', 'Pediatrics', 'Psychiatry', 'Radiology', 'Urology', 'Endocrinology', 'Gastroenterology',
];

const languages = ['Sinhala', 'English', 'Tamil', 'Hindi', 'Arabic'];

type DoctorProfile = {
  id?: string | number;
  full_name: string;
  email: string;
  phone: string;
  profile_picture: string;
  license_number: string;
  registration_council: string;
  years_of_experience: string;
  primary_specialty: string;
  secondary_specialty: string;
  sub_specialties: string[];
  qualification: string;
  medical_school: string;
  residency_hospital: string;
  consultation_fee: string;
  clinic_name: string;
  clinic_address: string;
  languages_spoken: string[];
  bio: string;
  notification_email: boolean;
  notification_sms: boolean;
  verification_status: string;
  updated_at?: string;
};

const emptyProfile: DoctorProfile = {
  full_name: '',
  email: '',
  phone: '',
  profile_picture: '',
  license_number: '',
  registration_council: '',
  years_of_experience: '',
  primary_specialty: '',
  secondary_specialty: '',
  sub_specialties: [],
  qualification: '',
  medical_school: '',
  residency_hospital: '',
  consultation_fee: '',
  clinic_name: '',
  clinic_address: '',
  languages_spoken: [],
  bio: '',
  notification_email: true,
  notification_sms: true,
  verification_status: 'Pending review',
};

function normalizeProfile(payload: any, userName: string, userEmail: string): DoctorProfile {
  const profile = payload?.data || payload || {};
  const stored = loadStoredJson<Partial<DoctorProfile>>(DOCTOR_PROFILE_UI_KEY, {});

  return {
    ...emptyProfile,
    ...stored,
    ...profile,
    full_name: stored.full_name || profile.full_name || userName,
    email: profile.email || stored.email || userEmail,
    phone: stored.phone || profile.phone || '',
    profile_picture: stored.profile_picture || profile.profile_picture || '',
    license_number: stored.license_number || profile.license_number || '',
    registration_council: stored.registration_council || profile.registration_council || '',
    years_of_experience: stored.years_of_experience || profile.years_of_experience || '',
    primary_specialty: profile.specialty || stored.primary_specialty || '',
    secondary_specialty: stored.secondary_specialty || '',
    sub_specialties: stored.sub_specialties || [],
    qualification: profile.qualification || stored.qualification || '',
    medical_school: stored.medical_school || '',
    residency_hospital: stored.residency_hospital || '',
    consultation_fee: profile.consultation_fee != null ? String(profile.consultation_fee) : String(stored.consultation_fee || ''),
    clinic_name: stored.clinic_name || '',
    clinic_address: stored.clinic_address || '',
    languages_spoken: stored.languages_spoken || [],
    bio: stored.bio || profile.bio || '',
    notification_email: stored.notification_email ?? true,
    notification_sms: stored.notification_sms ?? true,
    verification_status: stored.verification_status || 'Pending review',
    updated_at: profile.updated_at || stored.updated_at,
  };
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function toggleItem(items: string[], item: string) {
  return items.includes(item) ? items.filter((entry) => entry !== item) : [...items, item];
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState<DoctorProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/doctors/profile');
      const nextProfile = normalizeProfile(data, user?.full_name || '', user?.email || '');
      setProfile(nextProfile);
      setIsEditing(!nextProfile.id);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        setProfile(normalizeProfile({}, user?.full_name || '', user?.email || ''));
        setIsEditing(true);
        return;
      }

      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.full_name]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const summaryItems = useMemo(
    () => [
      { label: 'Verification', value: profile.verification_status || 'Pending review', tone: 'warning' as const },
      { label: 'Profile strength', value: `${completionPercent(profile as Record<string, unknown>, ['full_name', 'phone', 'license_number', 'registration_council', 'years_of_experience', 'primary_specialty', 'qualification', 'medical_school', 'residency_hospital', 'consultation_fee'])}% complete` },
      { label: 'Consultation fee', value: profile.consultation_fee ? `Rs. ${profile.consultation_fee}` : 'Not set' },
      { label: 'Availability', value: 'Managed on the Availability page' },
    ],
    [profile]
  );

  const handleChange = <K extends keyof DoctorProfile>(key: K, value: DoctorProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      specialty: profile.primary_specialty,
      qualification: profile.qualification,
      consultation_fee: profile.consultation_fee || null,
    };

    try {
      setSaving(true);
      const response = await api.put('/doctors/profile', payload);
      const nextProfile = {
        ...profile,
        id: response.data?.id || profile.id,
        consultation_fee: response.data?.consultation_fee != null ? String(response.data.consultation_fee) : profile.consultation_fee,
        updated_at: response.data?.updated_at || new Date().toISOString(),
      };

      saveStoredJson(DOCTOR_PROFILE_UI_KEY, {
        full_name: profile.full_name,
        phone: profile.phone,
        profile_picture: profile.profile_picture,
        license_number: profile.license_number,
        registration_council: profile.registration_council,
        years_of_experience: profile.years_of_experience,
        primary_specialty: profile.primary_specialty,
        secondary_specialty: profile.secondary_specialty,
        sub_specialties: profile.sub_specialties,
        qualification: profile.qualification,
        medical_school: profile.medical_school,
        residency_hospital: profile.residency_hospital,
        consultation_fee: profile.consultation_fee,
        clinic_name: profile.clinic_name,
        clinic_address: profile.clinic_address,
        languages_spoken: profile.languages_spoken,
        bio: profile.bio,
        notification_email: profile.notification_email,
        notification_sms: profile.notification_sms,
        verification_status: profile.verification_status,
        updated_at: nextProfile.updated_at,
      });

      setProfile(nextProfile);
      setIsEditing(false);
      updateUser({ full_name: profile.full_name });
      toast.success('Profile updated successfully');
      await loadProfile();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Unable to save profile');
    } finally {
      setSaving(false);
    }
  };

  const avatarInitials = getInitials(profile.full_name || user?.full_name || 'Doctor');

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-slate-200/80 bg-white">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#107393] via-[#147190] to-[#39bee5] p-6 text-white shadow-xl shadow-[#107393]/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_40%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/30 bg-white/15 text-2xl font-bold backdrop-blur-sm">
                {profile.profile_picture ? (
                  <img src={profile.profile_picture} alt={profile.full_name} className="h-full w-full object-cover" />
                ) : (
                  avatarInitials || <UserRound className="h-8 w-8" />
                )}
              </div>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Doctor Profile
                </span>
                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{profile.full_name || 'Doctor Profile'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
                  Manage your professional identity, consultation details, and practice information in one place.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/90">
                  <span className="rounded-full bg-white/15 px-3 py-1">{profile.email || user?.email || 'Email not set'}</span>
                  <span className="rounded-full bg-white/15 px-3 py-1">Last updated {formatTimestamp(profile.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:min-w-[280px]">
              <div className="rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between text-sm font-medium text-white/90">
                  <span>Profile completion</span>
                  <span>{completionPercent(profile as Record<string, unknown>, ['full_name', 'phone', 'license_number', 'registration_council', 'years_of_experience', 'primary_specialty', 'qualification', 'medical_school', 'residency_hospital', 'consultation_fee'])}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/15">
                  <div className="h-2 rounded-full bg-white" style={{ width: `${completionPercent(profile as Record<string, unknown>, ['full_name', 'phone', 'license_number', 'registration_council', 'years_of_experience', 'primary_specialty', 'qualification', 'medical_school', 'residency_hospital', 'consultation_fee'])}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" className="bg-white text-[#107393] hover:bg-slate-100" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  Upload photo
                </Button>
                <Button type="button" variant="secondary" onClick={() => setIsEditing((current) => !current)}>
                  {isEditing ? 'Switch to view mode' : 'Edit profile'}
                </Button>
              </div>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                setProfile((current) => ({ ...current, profile_picture: result }));
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>
      </Card>

      {loading ? (
        <Card>Loading profile...</Card>
      ) : (
        <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <Card>
              <h2 className="text-xl font-bold text-slate-900">Professional information</h2>
              <p className="mt-1 text-sm text-slate-500">Your public-facing identity and practice identifiers.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Full name" required span={2}>
                  {isEditing ? <input value={profile.full_name} onChange={(event) => handleChange('full_name', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.full_name} />}
                </Field>

                <Field label="Email address" required>
                  <ReadOnly value={profile.email || user?.email || 'Not set'} icon={<Mail className="h-4 w-4" />} />
                </Field>

                <Field label="Phone number" required>
                  {isEditing ? <input value={profile.phone} onChange={(event) => handleChange('phone', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.phone} icon={<Phone className="h-4 w-4" />} />}
                </Field>

                <Field label="License number" required>
                  {isEditing ? <input value={profile.license_number} onChange={(event) => handleChange('license_number', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.license_number} />}
                </Field>

                <Field label="Registration council" required>
                  {isEditing ? <input value={profile.registration_council} onChange={(event) => handleChange('registration_council', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.registration_council} />}
                </Field>

                <Field label="Years of experience" required>
                  {isEditing ? <input type="number" value={profile.years_of_experience} onChange={(event) => handleChange('years_of_experience', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.years_of_experience} />}
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Medical specialization</h2>
              <p className="mt-1 text-sm text-slate-500">Match your expertise with the right patient search and scheduling flows.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Primary specialty" required>
                  {isEditing ? (
                    <select value={profile.primary_specialty} onChange={(event) => handleChange('primary_specialty', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
                      <option value="">Select specialty</option>
                      {specialties.map((specialty) => <option key={specialty}>{specialty}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={profile.primary_specialty} icon={<Stethoscope className="h-4 w-4" />} />
                  )}
                </Field>

                <Field label="Secondary specialty">
                  {isEditing ? <input value={profile.secondary_specialty} onChange={(event) => handleChange('secondary_specialty', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.secondary_specialty} />}
                </Field>

                <Field label="Sub-specialties" span={2}>
                  <ChipGroup options={['Interventional', 'Pediatric', 'Critical Care', 'Surgical', 'Preventive', 'Rehabilitation']} value={profile.sub_specialties} onChange={(next) => handleChange('sub_specialties', next)} disabled={!isEditing} />
                </Field>

                <Field label="Qualifications" required span={2}>
                  {isEditing ? <textarea rows={4} value={profile.qualification} onChange={(event) => handleChange('qualification', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" placeholder="Degrees, certifications, and medical board memberships" /> : <ReadOnly value={profile.qualification} icon={<BadgeInfo className="h-4 w-4" />} />}
                </Field>

                <Field label="Medical school" required>
                  {isEditing ? <input value={profile.medical_school} onChange={(event) => handleChange('medical_school', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.medical_school} />}
                </Field>

                <Field label="Residency / hospital" required>
                  {isEditing ? <input value={profile.residency_hospital} onChange={(event) => handleChange('residency_hospital', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.residency_hospital} />}
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Practice details</h2>
              <p className="mt-1 text-sm text-slate-500">How and where patients can consult with you.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Consultation fee" required>
                  {isEditing ? <input type="number" value={profile.consultation_fee} onChange={(event) => handleChange('consultation_fee', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={`Rs. ${profile.consultation_fee || 'Not set'}`} />}
                </Field>

                <Field label="Clinic / hospital name">
                  {isEditing ? <input value={profile.clinic_name} onChange={(event) => handleChange('clinic_name', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.clinic_name} icon={<Hospital className="h-4 w-4" />} />}
                </Field>

                <Field label="Clinic address" span={2}>
                  {isEditing ? <textarea rows={3} value={profile.clinic_address} onChange={(event) => handleChange('clinic_address', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.clinic_address} />}
                </Field>

                <Field label="Languages spoken" span={2}>
                  <ChipGroup options={languages} value={profile.languages_spoken} onChange={(next) => handleChange('languages_spoken', next)} disabled={!isEditing} icon={<Languages className="h-4 w-4" />} />
                </Field>

                <Field label="Bio / description" span={2}>
                  {isEditing ? <textarea rows={4} value={profile.bio} onChange={(event) => handleChange('bio', event.target.value)} placeholder="Short clinical bio for patients" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" /> : <ReadOnly value={profile.bio} />}
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Account settings</h2>
              <p className="mt-1 text-sm text-slate-500">Notification preferences and current verification state.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Email notifications">
                  <Toggle checked={profile.notification_email} onChange={(checked) => handleChange('notification_email', checked)} disabled={!isEditing} />
                </Field>

                <Field label="SMS notifications">
                  <Toggle checked={profile.notification_sms} onChange={(checked) => handleChange('notification_sms', checked)} disabled={!isEditing} />
                </Field>

                <Field label="Verification status" span={2}>
                  <ReadOnly value={profile.verification_status} icon={<ShieldCheck className="h-4 w-4" />} />
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="submit" loading={saving} disabled={loading}>
                  Save profile
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing((current) => !current)}>
                  {isEditing ? 'Switch to view mode' : 'Edit mode'}
                </Button>
                <Button type="button" variant="secondary" onClick={logout}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </Button>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <h3 className="text-lg font-bold text-slate-900">Snapshot</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                {summaryItems.map((item) => (
                  <div key={item.label} className={`rounded-2xl border border-slate-200 px-4 py-3 ${item.tone === 'warning' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-1 font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-bold text-slate-900">Availability</h3>
              <p className="mt-2 text-sm text-slate-500">Weekly schedule, break times, and virtual hours are managed in the Availability page.</p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                Use the availability screen to publish the slots patients can book.
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-bold text-slate-900">Quick actions</h3>
              <div className="mt-4 space-y-3">
                <Button type="button" variant="outline" fullWidth onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Upload avatar
                </Button>
                <Button type="button" variant="secondary" fullWidth onClick={() => setProfile((current) => ({ ...current, notification_email: !current.notification_email, notification_sms: !current.notification_sms }))}>
                  Toggle notifications
                </Button>
              </div>
            </Card>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ children, label, required, span = 1 }: { children: React.ReactNode; label: string; required?: boolean; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <label className="mb-1 block text-sm font-semibold text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function ReadOnly({ value, icon }: { value: string | number | boolean | null | undefined; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      {icon}
      <span>{value ? String(value) : 'Not set'}</span>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${checked ? 'bg-[#107393]' : 'bg-slate-300'} ${disabled ? 'opacity-60' : ''}`}
    >
      <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

function ChipGroup({ options, value, onChange, disabled, icon }: { options: string[]; value: string[]; onChange: (value: string[]) => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        <span>Choose all that apply</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onChange(toggleItem(value, option))}
              className={`rounded-full border px-3 py-2 text-sm font-medium transition-all duration-200 ${active ? 'border-[#107393] bg-[#107393] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[#107393]/25 hover:text-[#107393]'} ${disabled ? 'cursor-default opacity-80' : ''}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

