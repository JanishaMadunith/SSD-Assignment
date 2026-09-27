import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bell,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Shield,
  UserRound,
  Wifi,
} from 'lucide-react';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { useAuth } from '../../context/AuthContext';
import { completionPercent, formatTimestamp, loadStoredJson, saveStoredJson } from '../../utils/profile';

const ADMIN_PROFILE_UI_KEY = 'suwapiyasa_admin_profile_ui';

const roles = ['Super Admin', 'Admin', 'Support'];

type AdminProfile = {
  full_name: string;
  email: string;
  role: string;
  profile_picture: string;
  department: string;
  two_factor_enabled: boolean;
  notification_email: boolean;
  notification_sms: boolean;
  ip_whitelist: string;
  session_timeout_minutes: string;
  api_keys: string[];
  activity_log: string[];
  permissions: string[];
  updated_at?: string;
};

const defaultProfile: AdminProfile = {
  full_name: '',
  email: '',
  role: 'Admin',
  profile_picture: '',
  department: '',
  two_factor_enabled: true,
  notification_email: true,
  notification_sms: false,
  ip_whitelist: '0.0.0.0/0',
  session_timeout_minutes: '30',
  api_keys: ['prod-main-****-8921', 'analytics-****-1104'],
  activity_log: [
    'Updated doctor verification policy',
    'Reviewed profile moderation queue',
    'Regenerated API key for integration bot',
  ],
  permissions: ['Manage Users', 'Verify Doctors', 'View Audit Logs', 'Configure Alerts'],
};

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export default function AdminProfilePage() {
  const { user, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState<AdminProfile>(() => {
    const stored = loadStoredJson<Partial<AdminProfile>>(ADMIN_PROFILE_UI_KEY, {});
    return {
      ...defaultProfile,
      ...stored,
      full_name: stored.full_name || user?.full_name || 'Platform Admin',
      email: stored.email || user?.email || '',
    };
  });
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const completion = useMemo(
    () => completionPercent(profile as Record<string, unknown>, ['full_name', 'role', 'department', 'ip_whitelist', 'session_timeout_minutes']),
    [profile]
  );

  const handleChange = <K extends keyof AdminProfile>(key: K, value: AdminProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      const next = { ...profile, updated_at: new Date().toISOString() };
      setProfile(next);
      saveStoredJson(ADMIN_PROFILE_UI_KEY, next);
      updateUser({ full_name: profile.full_name });
      setIsEditing(false);
      toast.success('Admin profile updated successfully');
    } finally {
      setSaving(false);
    }
  };

  const maskedApiKeys = profile.api_keys;

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
                  getInitials(profile.full_name) || <UserRound className="h-8 w-8" />
                )}
              </div>
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
                  <Shield className="h-3.5 w-3.5" />
                  Admin Profile
                </span>
                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{profile.full_name}</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/90 sm:text-base">
                  Configure personal admin settings, security controls, and system access preferences.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/90">
                  <span className="rounded-full bg-white/15 px-3 py-1">{profile.email || 'Email not set'}</span>
                  <span className="rounded-full bg-white/15 px-3 py-1">Last updated {formatTimestamp(profile.updated_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:min-w-[280px]">
              <div className="rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between text-sm font-medium text-white/90">
                  <span>Profile completion</span>
                  <span>{completion}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/15">
                  <div className="h-2 rounded-full bg-white" style={{ width: `${completion}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" className="bg-white text-[#107393] hover:bg-slate-100" onClick={() => setIsEditing((current) => !current)}>
                  {isEditing ? 'View mode' : 'Edit mode'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-xl font-bold text-slate-900">Admin information</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Full name" required>
                {isEditing ? (
                  <input value={profile.full_name} onChange={(event) => handleChange('full_name', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                ) : (
                  <ReadOnly value={profile.full_name} />
                )}
              </Field>

              <Field label="Email address" required>
                <ReadOnly value={profile.email} icon={<Mail className="h-4 w-4" />} />
              </Field>

              <Field label="Role" required>
                {isEditing ? (
                  <select value={profile.role} onChange={(event) => handleChange('role', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20">
                    {roles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                ) : (
                  <ReadOnly value={profile.role} />
                )}
              </Field>

              <Field label="Department">
                {isEditing ? (
                  <input value={profile.department} onChange={(event) => handleChange('department', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                ) : (
                  <ReadOnly value={profile.department} />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-bold text-slate-900">Account settings</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Two-factor authentication">
                <Toggle checked={profile.two_factor_enabled} onChange={(value) => handleChange('two_factor_enabled', value)} disabled={!isEditing} />
              </Field>

              <Field label="Email alerts">
                <Toggle checked={profile.notification_email} onChange={(value) => handleChange('notification_email', value)} disabled={!isEditing} />
              </Field>

              <Field label="SMS alerts">
                <Toggle checked={profile.notification_sms} onChange={(value) => handleChange('notification_sms', value)} disabled={!isEditing} />
              </Field>

              <Field label="Session timeout (minutes)">
                {isEditing ? (
                  <input value={profile.session_timeout_minutes} onChange={(event) => handleChange('session_timeout_minutes', event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                ) : (
                  <ReadOnly value={profile.session_timeout_minutes} icon={<Lock className="h-4 w-4" />} />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-bold text-slate-900">System access</h2>
            <div className="mt-5 grid gap-4">
              <Field label="IP whitelist">
                {isEditing ? (
                  <textarea value={profile.ip_whitelist} onChange={(event) => handleChange('ip_whitelist', event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" />
                ) : (
                  <ReadOnly value={profile.ip_whitelist} icon={<MapPin className="h-4 w-4" />} />
                )}
              </Field>

              <Field label="Assigned permissions">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {profile.permissions.map((permission) => (
                    <span key={permission} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700">
                      {permission}
                    </span>
                  ))}
                </div>
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button type="submit" loading={saving}>
                Save profile
              </Button>
              <Button type="button" variant="outline" onClick={() => toast('Password change endpoint is not available yet in backend')}>
                Change password
              </Button>
              <Button type="button" variant="secondary" onClick={logout}>
                Logout
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-slate-900">API keys</h3>
            <div className="mt-4 space-y-3">
              {maskedApiKeys.map((key) => (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{key}</span>
                    <KeyRound className="h-4 w-4 text-slate-500" />
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => toast.success('Generated new API key (demo)')}>
              Generate new key
            </Button>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-slate-900">Active sessions</h3>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Wifi className="h-4 w-4" /> Current browser session</span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Active</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-slate-900">Activity log</h3>
            <div className="mt-4 space-y-2">
              {profile.activity_log.map((item) => (
                <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-slate-900">Notifications</h3>
            <p className="mt-2 text-sm text-slate-500">Email and SMS toggles control delivery for system alerts and operational notices.</p>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <span className="inline-flex items-center gap-2"><Bell className="h-4 w-4" /> Alerts are {profile.notification_email || profile.notification_sms ? 'enabled' : 'disabled'}</span>
            </div>
          </Card>
        </div>
      </form>
    </div>
  );
}

function Field({ children, label, required }: { children: React.ReactNode; label: string; required?: boolean }) {
  return (
    <div>
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