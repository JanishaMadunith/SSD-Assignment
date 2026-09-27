import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth, UserRole } from '../context/AuthContext';

const roleHome: Record<UserRole, string> = {
  patient: '/patient',
  doctor: '/doctor',
  admin: '/admin',
};

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleGoogleCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    async function processCallback() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        const errorMsg = `Google sign-in error: ${errorParam}`;
        setError(errorMsg);
        toast.error(errorMsg);
        setTimeout(() => navigate('/login', { replace: true }), 2500);
        return;
      }

      if (!code || !state) {
        setError('Missing authorization code or state parameter.');
        toast.error('Invalid callback URL');
        setTimeout(() => navigate('/login', { replace: true }), 2500);
        return;
      }

      const savedState = sessionStorage.getItem('oidc_state');
      const codeVerifier = sessionStorage.getItem('oidc_code_verifier');
      const nonce = sessionStorage.getItem('oidc_nonce') || undefined;

      // CSRF check: verify state parameter matches sessionStorage
      if (!savedState || savedState !== state) {
        setError('State validation failed (possible CSRF attack). Authentication aborted.');
        toast.error('Security verification failed');
        sessionStorage.removeItem('oidc_state');
        sessionStorage.removeItem('oidc_code_verifier');
        sessionStorage.removeItem('oidc_nonce');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
        return;
      }

      if (!codeVerifier) {
        setError('Missing PKCE code verifier in session.');
        toast.error('Session expired. Please try signing in again.');
        setTimeout(() => navigate('/login', { replace: true }), 2500);
        return;
      }

      try {
        const user = await handleGoogleCallback({
          code,
          code_verifier: codeVerifier,
          state,
          nonce
        });

        // Clean up sessionStorage after successful exchange
        sessionStorage.removeItem('oidc_state');
        sessionStorage.removeItem('oidc_code_verifier');
        sessionStorage.removeItem('oidc_nonce');

        toast.success(`Welcome, ${user.full_name || user.email}!`);
        const targetRoute = roleHome[user.role] || '/patient';
        navigate(targetRoute, { replace: true });
      } catch (err: any) {
        const errMsg = err?.response?.data?.message || err?.message || 'Google authentication failed';
        setError(errMsg);
        toast.error(errMsg);
        sessionStorage.removeItem('oidc_state');
        sessionStorage.removeItem('oidc_code_verifier');
        sessionStorage.removeItem('oidc_nonce');
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      }
    }

    processCallback();
  }, [handleGoogleCallback, navigate, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        {error ? (
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-slate-800">Authentication Failed</h2>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <p className="mt-4 text-xs text-slate-500">Redirecting to login...</p>
          </div>
        ) : (
          <div>
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#107393] border-t-transparent" />
            <h2 className="text-xl font-bold text-slate-800">Authenticating with Google</h2>
            <p className="mt-2 text-sm text-slate-600">Verifying security tokens and completing sign in...</p>
          </div>
        )}
      </div>
    </div>
  );
}
