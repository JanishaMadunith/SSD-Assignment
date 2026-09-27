import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Camera, Lock, MapPin, Phone, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { useAuth } from '../../context/AuthContext';
import { completionPercent, formatTimestamp, joinAddress, loadStoredJson, saveStoredJson, splitAddress, toStringArray } from '../../utils/profile';

const PATIENT_PROFILE_UI_KEY = 'suwapiyasa_patient_profile_ui';

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const genders = ['Male', 'Female', 'Other'];
const districts = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota',
  'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle',
];
const languages = ['Sinhala', 'English', 'Tamil'];

type PatientProfile = {
  id?: string | number;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  blood_type: string;
  profile_picture: string;
  street_address: string;
  city: string;
  district: string;
  postal_code: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  language_preference: string;
  notification_email: boolean;
  notification_sms: boolean;
  two_factor_enabled: boolean;
  medical_history: {
    allergies?: string[];
    conditions?: string[];
    medications?: string[];
    notes?: string;
  };
  updated_at?: string;
};

const emptyProfile: PatientProfile = {
  full_name: '',
  email: '',
  phone: '',
  date_of_birth: '',
  gender: '',
  blood_type: '',
  profile_picture: '',
  street_address: '',
  city: '',
  district: '',
  postal_code: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  language_preference: 'English',
  notification_email: true,
  notification_sms: false,
  two_factor_enabled: false,
  medical_history: {},
};

function normalizeProfile(payload: any): PatientProfile {
  const profile = payload?.data || payload || {};
  const stored = loadStoredJson<Partial<PatientProfile>>(PATIENT_PROFILE_UI_KEY, {});
  const address = splitAddress(profile.address || stored.street_address || '');
  const medicalHistory = profile.medical_history || {};

  return {
    ...emptyProfile,
    ...stored,
    ...profile,
    full_name: profile.full_name || profile.name || stored.full_name || '',
    email: profile.email || stored.email || '',
    street_address: stored.street_address || address.street_address,
    city: stored.city || address.city,
    district: stored.district || address.district,
    postal_code: stored.postal_code || address.postal_code,
    medical_history: {
      allergies: toStringArray(medicalHistory.allergies),
      conditions: toStringArray(medicalHistory.conditions),
      medications: toStringArray(medicalHistory.medications),
      notes: medicalHistory.notes || '',
    },
  };
}

function getAvatarInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export default function Profile() {
  const { user, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState<PatientProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/patients/profile');
      const nextProfile = normalizeProfile(data);
      setProfile(nextProfile);
      setIsEditing(!nextProfile.id);
    } catch (error: any) {
      if (error?.response?.status === 404) {
        const stored = normalizeProfile({});
        setProfile(stored);
        setIsEditing(true);
        return;
      }

      toast.error(error?.response?.data?.message || error?.response?.data?.error || 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const summaryItems = useMemo(
    () => [
      { label: 'Email verification', value: 'Verified', tone: 'success' as const },
      { label: 'Profile strength', value: `${completionPercent(profile as Record<string, unknown>, ['full_name', 'phone', 'date_of_birth', 'gender', 'blood_type', 'street_address', 'city', 'district', 'postal_code', 'emergency_contact_name', 'emergency_contact_phone'])}% complete` },
      { label: 'Language', value: profile.language_preference || 'English' },
      { label: 'Security', value: profile.two_factor_enabled ? '2FA enabled' : '2FA disabled', tone: profile.two_factor_enabled ? 'success' as const : 'warning' as const },
    ],
    [profile]
  );

  const handleChange = <K extends keyof PatientProfile>(key: K, value: PatientProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = {
      name: profile.full_name,
      phone: profile.phone,
      date_of_birth: profile.date_of_birth || null,
      gender: profile.gender || null,
      blood_type: profile.blood_type || null,
      address: joinAddress(profile),
      emergency_contact_name: profile.emergency_contact_name || null,
      emergency_contact_phone: profile.emergency_contact_phone || null,
    };

    try {
      setSaving(true);
      const request = profile.id ? api.put('/patients/profile', payload) : api.post('/patients/profile', payload);
      const response = await request;
      const serverProfile = normalizeProfile(response.data);

      const nextProfile = {
        ...profile,
        ...serverProfile,
        updated_at: response.data?.updated_at || new Date().toISOString(),
      };

      saveStoredJson(PATIENT_PROFILE_UI_KEY, {
        profile_picture: profile.profile_picture,
        language_preference: profile.language_preference,
        notification_email: profile.notification_email,
        notification_sms: profile.notification_sms,
        two_factor_enabled: profile.two_factor_enabled,
        street_address: profile.street_address,
        city: profile.city,
        district: profile.district,
        postal_code: profile.postal_code,
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

  const medicalHistory = profile.medical_history || {};
  const avatarInitials = getAvatarInitials(profile.full_name || user?.full_name || 'Patient');

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
                  Patient Profile
                </span>
                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{profile.full_name || 'Patient Profile'}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
                  Keep your contact, address, and emergency details current so care teams can reach you quickly.
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
                  <span>{completionPercent(profile as Record<string, unknown>, ['full_name', 'phone', 'date_of_birth', 'gender', 'blood_type', 'street_address', 'city', 'district', 'postal_code', 'emergency_contact_name', 'emergency_contact_phone'])}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/15">
                  <div className="h-2 rounded-full bg-white" style={{ width: `${completionPercent(profile as Record<string, unknown>, ['full_name', 'phone', 'date_of_birth', 'gender', 'blood_type', 'street_address', 'city', 'district', 'postal_code', 'emergency_contact_name', 'emergency_contact_phone'])}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <Button type="button" className="bg-white text-[#107393] hover:bg-slate-100" onClick={() => fileInputRef.current?.click()}>
                      <Camera className="h-4 w-4" />
                      Upload photo
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => { setIsEditing(false); setProfile(normalizeProfile(profile)); }}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button type="button" className="bg-white text-[#107393] hover:bg-slate-100" onClick={() => setIsEditing(true)}>
                    Edit profile
                  </Button>
                )}
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
        <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Personal information</h2>
                  <p className="mt-1 text-sm text-slate-500">Core identity and contact details used by the care team.</p>
                </div>
                <span className="rounded-full bg-[#107393]/10 px-3 py-1 text-xs font-semibold text-[#107393]">Editable</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Full name" required>
                  {isEditing ? (
                    <input value={profile.full_name} onChange={(event) => handleChange('full_name', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.full_name} />
                  )}
                </Field>

                <Field label="Email address" required>
                  <ReadOnly value={profile.email || user?.email || 'Not set'} />
                </Field>

                <Field label="Phone number" required>
                  {isEditing ? (
                    <input value={profile.phone} onChange={(event) => handleChange('phone', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.phone} icon={<Phone className="h-4 w-4" />} />
                  )}
                </Field>

                <Field label="Date of birth" required>
                  {isEditing ? (
                    <input type="date" value={profile.date_of_birth} onChange={(event) => handleChange('date_of_birth', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.date_of_birth} />
                  )}
                </Field>

                <Field label="Gender" required>
                  {isEditing ? (
                    <select value={profile.gender} onChange={(event) => handleChange('gender', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
                      <option value="">Select gender</option>
                      {genders.map((gender) => <option key={gender}>{gender}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={profile.gender} />
                  )}
                </Field>

                <Field label="Blood type">
                  {isEditing ? (
                    <select value={profile.blood_type} onChange={(event) => handleChange('blood_type', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
                      <option value="">Select blood type</option>
                      {bloodTypes.map((bloodType) => <option key={bloodType}>{bloodType}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={profile.blood_type} />
                  )}
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Address information</h2>
              <p className="mt-1 text-sm text-slate-500">Use structured fields so your address is easier to search and verify.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Street address" required span={2}>
                  {isEditing ? (
                    <input value={profile.street_address} onChange={(event) => handleChange('street_address', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.street_address} icon={<MapPin className="h-4 w-4" />} />
                  )}
                </Field>

                <Field label="City" required>
                  {isEditing ? (
                    <input value={profile.city} onChange={(event) => handleChange('city', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.city} />
                  )}
                </Field>

                <Field label="District" required>
                  {isEditing ? (
                    <select value={profile.district} onChange={(event) => handleChange('district', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
                      <option value="">Select district</option>
                      {districts.map((district) => <option key={district}>{district}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={profile.district} />
                  )}
                </Field>

                <Field label="Postal code" required>
                  {isEditing ? (
                    <input value={profile.postal_code} onChange={(event) => handleChange('postal_code', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.postal_code} />
                  )}
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Emergency contact</h2>
              <p className="mt-1 text-sm text-slate-500">This person is used when clinicians need to reach someone quickly.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Contact name">
                  {isEditing ? (
                    <input value={profile.emergency_contact_name} onChange={(event) => handleChange('emergency_contact_name', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.emergency_contact_name} />
                  )}
                </Field>

                <Field label="Contact phone">
                  {isEditing ? (
                    <input value={profile.emergency_contact_phone} onChange={(event) => handleChange('emergency_contact_phone', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.emergency_contact_phone} icon={<Phone className="h-4 w-4" />} />
                  )}
                </Field>

                <Field label="Relationship" span={2}>
                  {isEditing ? (
                    <input value={profile.emergency_contact_relationship} onChange={(event) => handleChange('emergency_contact_relationship', event.target.value)} placeholder="Spouse, parent, sibling, or friend" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                  ) : (
                    <ReadOnly value={profile.emergency_contact_relationship} />
                  )}
                </Field>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-bold text-slate-900">Medical summary</h2>
              <p className="mt-1 text-sm text-slate-500">Read-only summary from medical history and prescriptions.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <SummaryBlock label="Allergies" value={medicalHistory.allergies?.join(', ') || 'Not set'} />
                <SummaryBlock label="Chronic conditions" value={medicalHistory.conditions?.join(', ') || 'Not set'} />
                <SummaryBlock label="Current medications" value={medicalHistory.medications?.join(', ') || 'Not set'} />
                <SummaryBlock label="Notes" value={medicalHistory.notes || 'Not set'} span={2} />
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Account settings</h2>
                  <p className="mt-1 text-sm text-slate-500">Quick preferences and security controls for the patient portal.</p>
                </div>
                <Bell className="h-5 w-5 text-[#107393]" />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Language preference">
                  {isEditing ? (
                    <select value={profile.language_preference} onChange={(event) => handleChange('language_preference', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
                      {languages.map((language) => <option key={language}>{language}</option>)}
                    </select>
                  ) : (
                    <ReadOnly value={profile.language_preference} />
                  )}
                </Field>

                <Field label="Email notifications">
                  {isEditing ? (
                    <Toggle checked={profile.notification_email} onChange={(value) => handleChange('notification_email', value)} />
                  ) : (
                    <ReadOnly value={profile.notification_email ? 'Enabled' : 'Disabled'} />
                  )}
                </Field>

                <Field label="SMS notifications">
                  {isEditing ? (
                    <Toggle checked={profile.notification_sms} onChange={(value) => handleChange('notification_sms', value)} />
                  ) : (
                    <ReadOnly value={profile.notification_sms ? 'Enabled' : 'Disabled'} />
                  )}
                </Field>

                <Field label="Two-factor authentication">
                  {isEditing ? (
                    <Toggle checked={profile.two_factor_enabled} onChange={(value) => handleChange('two_factor_enabled', value)} />
                  ) : (
                    <ReadOnly value={profile.two_factor_enabled ? 'Enabled' : 'Disabled'} icon={<Lock className="h-4 w-4" />} />
                  )}
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="submit" loading={saving} disabled={loading}>
                  Save profile
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEditing((current) => !current)}>
                  {isEditing ? 'Switch to view mode' : 'Edit mode'}
                </Button>
                <Button type="button" variant="danger" onClick={() => toast('Account deletion is handled by support for now')}>
                  <Trash2 className="h-4 w-4" />
                  Request deletion
                </Button>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <h3 className="text-lg font-bold text-slate-900">Profile snapshot</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                {summaryItems.map((item) => (
                  <div key={item.label} className={`rounded-2xl border border-slate-200 px-4 py-3 ${item.tone === 'success' ? 'bg-emerald-50' : item.tone === 'warning' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-1 font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-bold text-slate-900">Verification</h3>
              <p className="mt-2 text-sm text-slate-500">Email and phone verification keep your account secure and make it easier for care teams to reach you.</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Email:</span> Verified
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Phone:</span> Pending OTP confirmation
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-bold text-slate-900">Quick actions</h3>
              <div className="mt-4 space-y-3">
                <Button type="button" variant="outline" fullWidth onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  Upload avatar
                </Button>
                <Button type="button" variant="secondary" fullWidth onClick={logout}>
                  Logout
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

function SummaryBlock({ label, value, span = 1 }: { label: string; value: string; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? 'md:col-span-2' : ''}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${checked ? 'bg-[#107393]' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

