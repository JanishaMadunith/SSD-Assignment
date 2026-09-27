import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  HeartPulse,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
  Video,
} from 'lucide-react';
import { FaApple, FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import logo from './assert/2.png';
import './App.css';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth, UserRole } from './context/AuthContext';
import { initiateGoogleLogin } from './utils/pkce';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import PatientDashboard from './pages/patient/Dashboard';
import SearchDoctors from './pages/patient/SearchDoctors';
import PatientAppointments from './pages/patient/Appointments';
import AppointmentSummary from './pages/patient/AppointmentSummary';
import PatientProfile from './pages/patient/Profile';
import SymptomChecker from './pages/patient/SymptomChecker';
import DoctorDashboard from './pages/doctor/Dashboard';
import DoctorAppointments from './pages/doctor/Appointments';
import DoctorAvailability from './pages/doctor/Availability';
import DoctorProfile from './pages/doctor/Profile';
import DoctorApplication from './pages/DoctorApplication';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminDoctors from './pages/admin/Doctors';
import AdminProfile from './pages/admin/Profile';

const roleHome: Record<UserRole, string> = {
  patient: '/patient',
  doctor: '/doctor',
  admin: '/admin',
};

function ProtectedRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#107393] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome[user.role]} replace />;
  }

  return <Outlet />;
}

function LandingPage() {
  const [showSignInDrawer, setShowSignInDrawer] = useState(false);

  const stats = [
    { value: '42K+', label: 'Patients supported' },
    { value: '1,200+', label: 'Verified doctors' },
    { value: '98.7%', label: 'Patient satisfaction' },
  ];

  const socialLinks: { label: string; icon: React.ReactNode }[] = [
    { label: 'Facebook', icon: React.createElement(FaFacebookF as any, { className: 'h-4 w-4' }) },
    { label: 'Instagram', icon: React.createElement(FaInstagram as any, { className: 'h-4 w-4' }) },
    { label: 'YouTube', icon: React.createElement(FaYoutube as any, { className: 'h-4 w-4' }) },
    { label: 'LinkedIn', icon: React.createElement(FaLinkedinIn as any, { className: 'h-4 w-4' }) },
  ];

  const features = [
    {
      icon: Video,
      title: 'Telemedicine built for trust',
      description: 'Secure video consults, live chat, and calm waiting-room flows designed for real care delivery.',
    },
    {
      icon: CalendarDays,
      title: 'Fast appointment booking',
      description: 'Intuitive scheduling with availability, reminders, and clear step-by-step confirmation.',
    },
    {
      icon: ShieldCheck,
      title: 'Enterprise-grade security',
      description: 'Role-aware access patterns and privacy-first UI patterns that support a healthcare workflow.',
    },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero__background" aria-hidden="true">
          <span className="hero__orb hero__orb--one" />
          <span className="hero__orb hero__orb--two" />
          <span className="hero__grid" />
        </div>

        <nav className="topbar">
          <div className="brand">
            <img className="brand__logo" src={logo} alt="MediFlow logo" />
            <div>
              <p className="brand__name">SUWAPIYASA.LK</p>
              <p className="brand__tag">AI-powered telemedicine platform</p>
            </div>
          </div>

          <div className="topbar__actions">
            <span className="topbar__pill">
              <Sparkles size={14} />
              Premium experience
            </span>
            <Link className="ghost-button" to="/login">
              Explore product
            </Link>
            <button className="secondary-button" type="button" onClick={() => setShowSignInDrawer(true)}>
              Sign in
            </button>
          </div>
        </nav>

        <div className="hero__content">
          <motion.div
            className="hero__copy"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <span className="eyebrow">Healthcare, redesigned for speed and clarity</span>
            <h1>
              A beautiful digital clinic for modern patient journeys.
            </h1>
            <p className="hero__lede">
              MediFlow brings scheduling, consultations, prescriptions, and health insights into one polished experience that feels calm, fast, and dependable.
            </p>

            <div className="hero__cta-row">
              <Link className="primary-button" to="/register">
                Book a consultation
                <ArrowRight size={18} />
              </Link>
              <Link className="secondary-button" to="/login">
                View dashboard
              </Link>
            </div>

            <div className="trust-row">
              <div className="trust-row__item">
                <CheckCircle2 size={16} />
                Secure patient data
              </div>
              <div className="trust-row__item">
                <CheckCircle2 size={16} />
                Verified clinicians
              </div>
              <div className="trust-row__item">
                <CheckCircle2 size={16} />
                Live care support
              </div>
            </div>
          </motion.div>

          <motion.div
            className="hero__visual"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
          >
            <div className="glass-card glass-card--feature">
              <div className="glass-card__header">
                <div>
                  <p className="glass-card__label">Today’s care flow</p>
                  <h2>Seamless patient engagement</h2>
                </div>
                <span className="status-badge status-badge--live">Live</span>
              </div>

              <div className="care-stack">
                <div className="care-card care-card--accent">
                  <HeartPulse size={18} />
                  <div>
                    <strong>AI health triage</strong>
                    <p>Symptoms analyzed in seconds</p>
                  </div>
                </div>
                <div className="care-card">
                  <MessageSquare size={18} />
                  <div>
                    <strong>Doctor chat</strong>
                    <p>Real-time support during consults</p>
                  </div>
                </div>
                <div className="care-card">
                  <Stethoscope size={18} />
                  <div>
                    <strong>Specialist routing</strong>
                    <p>Matched to the right care path</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card glass-card--metrics">
              <p className="glass-card__label">Platform performance</p>
              <div className="metrics-grid">
                {stats.map((stat) => (
                  <div key={stat.label} className="metric">
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="section section--cards">
        <div className="section__heading">
          <span className="eyebrow">Built for product excellence</span>
          <h2>Everything is arranged to feel premium, legible, and fast.</h2>
        </div>

        <div className="feature-grid">
          {features.map((feature, index) => {
            const Icon = feature.icon;

            return (
              <motion.article
                key={feature.title}
                className="glass-card feature-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
              >
                <div className="feature-card__icon">
                  <Icon size={20} />
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </motion.article>
            );
          })}
        </div>
      </section>

      {showSignInDrawer && (
        <div className="signin-drawer__backdrop" role="dialog" aria-modal="true" onClick={() => setShowSignInDrawer(false)}>
          <aside className="signin-drawer" onClick={(event) => event.stopPropagation()}>
            <button className="signin-drawer__close" type="button" aria-label="Close sign in panel" onClick={() => setShowSignInDrawer(false)}>
              <X size={28} />
            </button>

            <div className="signin-drawer__logo-wrap">
              <img src={logo} alt="SUWAPIYASA logo" className="signin-drawer__logo" />
            </div>

            <h2 className="signin-drawer__title">Sign in to SUWAPIYASA</h2>
            <p className="signin-drawer__text">
              By signing in, you agree to our <a href="/login">terms of use</a> and acknowledge you have read our <a href="/login">privacy notice</a>.
            </p>

            <div className="signin-drawer__actions">
              <button className="signin-social-btn" type="button">
                {React.createElement(FaApple as any, { className: 'h-5 w-5' })}
                Continue with Apple
              </button>
              <button className="signin-social-btn" type="button" onClick={() => initiateGoogleLogin()}>
                {React.createElement(FcGoogle as any, { className: 'h-5 w-5' })}
                Continue with Google
              </button>
            </div>

            <Link className="signin-drawer__email-link" to="/login" onClick={() => setShowSignInDrawer(false)}>
              Use email and password
            </Link>
          </aside>
        </div>
      )}

      <section className="section section--footer">
        <div className="footer-card glass-card">
          <div className="footer-card__intro">
            <div className="footer-brand">
              <img className="brand__logo" src={logo} alt="SUWAPIYASA.LK logo" />
              <div>
                <p className="brand__name">SUWAPIYASA.LK</p>
                <p className="brand__tag">AI-powered telemedicine platform</p>
              </div>
            </div>

            <div>
              <span className="eyebrow">Stay connected</span>
              <h2 className="mt-3">Sign up for care updates and wellness tips</h2>
              <p className="mt-3 max-w-2xl text-slate-600">
                Receive practical health guidance, appointment reminders, and platform updates designed to help patients stay informed and confident.
              </p>
            </div>
          </div>

          <div className="footer-card__main">
            <div className="footer-card__newsletter">
              <form className="footer-newsletter">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="footer-newsletter__input"
                />
                <button className="primary-button footer-newsletter__button" type="button">
                  Subscribe
                  <ArrowRight size={18} />
                </button>
              </form>
            </div>

            <div className="footer-card__links">
              <div>
                <h3>Follow us</h3>
                <div className="footer-socials">
                    {socialLinks.map(({ label, icon }) => (
                    <a key={label} href="https://www.suwapiyasa.lk" aria-label={label} className="footer-chip footer-chip--icon" target="_blank" rel="noreferrer">
                        {icon}
                      </a>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className="footer-card__policies">
            <div>
              <h3>Policies</h3>
              <div className="footer-policy-links">
                {['Privacy Policy', 'Cookie Policy', 'Terms of Use', 'Accessibility Statement'].map((item) => (
                  <a key={item} href="/login">
                    {item}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h3>About</h3>
              <div className="footer-policy-links">
                {['For Patients', 'For Doctors', 'For Partners', 'Support'].map((item) => {
                  if (item === 'For Doctors') {
                    return (
                      <Link key={item} to="/doctor/register">
                        Join With Us As a Doctor
                      </Link>
                    );
                  }

                  return (
                    <a key={item} href="/login">
                      {item}
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="footer-card__disclaimer">
            SUWAPIYASA.LK provides digital healthcare tools and telemedicine workflow support. It does not replace professional medical judgment, diagnosis, or emergency care. If you are experiencing a medical emergency, contact local emergency services immediately.
            <span>© 2026 SUWAPIYASA.LK. All rights reserved.</span>
          </div>
        </div>
      </section>

    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/doctor/register" element={<DoctorApplication />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
            <Route path="/patient/appointments/:id" element={<AppointmentSummary />} />
            <Route path="/patient" element={<Layout />}>
              <Route index element={<PatientDashboard />} />
              <Route path="search" element={<SearchDoctors />} />
              <Route path="appointments" element={<PatientAppointments />} />
              <Route path="profile" element={<PatientProfile />} />
              <Route path="symptom-checker" element={<SymptomChecker />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
            <Route path="/doctor" element={<Layout />}>
              <Route index element={<DoctorDashboard />} />
              <Route path="appointments" element={<DoctorAppointments />} />
              <Route path="availability" element={<DoctorAvailability />} />
              <Route path="profile" element={<DoctorProfile />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<Layout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="doctors" element={<AdminDoctors />} />
              <Route path="profile" element={<AdminProfile />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

