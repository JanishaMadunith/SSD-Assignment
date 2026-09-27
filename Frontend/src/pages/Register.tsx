import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Card from '../components/UI/Card';
import Button from '../components/UI/Button';

export default function Register() {
  const navigate = useNavigate();
  const { register, isAuthenticated, user, loading } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      navigate(`/${user.role}`, { replace: true });
    }
  }, [isAuthenticated, loading, navigate, user]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.full_name.trim()) nextErrors.full_name = 'Full name is required';
    if (!form.email.trim()) nextErrors.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = 'Enter a valid email';
    if (!form.password || form.password.length < 6) nextErrors.password = 'Minimum 6 characters';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    try {
      setSubmitting(true);
      await register({ ...form, role: 'patient' });
      toast.success('Account created successfully');
      navigate('/login', { replace: true });
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-black">Create account</h1>
          <p className="mt-2 text-sm text-slate-600">Join the SUWAPIYASA.LK telemedicine platform.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" type="text" placeholder="Your full name" />
            {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" type="email" placeholder="you@example.com" />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-[#107393] focus:ring-2 focus:ring-[#107393]/20" type="password" placeholder="Minimum 6 characters" />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
          </div>

          <Button type="submit" loading={submitting} fullWidth>
            Create patient account
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link className="font-semibold text-[#107393] hover:underline" to="/login">
            Login
          </Link>
        </div>
      </Card>
    </div>
  );
}
