import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export type UserRole = 'patient' | 'doctor' | 'admin';

export interface AuthUser {
  id: string | number;
  email: string;
  role: UserRole;
  full_name: string;
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: { full_name: string; email: string; password: string; role: Exclude<UserRole, 'admin'>; }) => Promise<void>;
  handleGoogleCallback: (payload: { code: string; code_verifier: string; state: string; nonce?: string }) => Promise<AuthUser>;
  updateUser: (updates: Partial<AuthUser>) => void;
  logout: () => void;
}

const TOKEN_KEY = 'suwapiyasa_token';
const USER_KEY = 'suwapiyasa_user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as { exp?: number };
  } catch {
    return null;
  }
}

function isTokenExpired(token: string) {
  const payload = decodeJwtPayload(token);
  return Boolean(payload?.exp && Date.now() >= payload.exp * 1000);
}

function readStoredAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  const user = localStorage.getItem(USER_KEY);

  if (!token || !user) return { token: null as string | null, user: null as AuthUser | null };
  if (isTokenExpired(token)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { token: null, user: null };
  }

  try {
    return { token, user: JSON.parse(user) as AuthUser };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    const auth = readStoredAuth();
    setToken(auth.token);
    setUser(auth.user);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!token) return;

    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return;

    const timeout = window.setTimeout(() => {
      clearAuth();
      toast.error('Session expired. Please log in again.');
      navigate('/login', { replace: true });
    }, Math.max(payload.exp * 1000 - Date.now(), 0));

    return () => window.clearTimeout(timeout);
  }, [clearAuth, navigate, token]);

  const persistAuth = useCallback((auth: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, auth.token);
    localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    setToken(auth.token);
    setUser(auth.user);
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUser>) => {
    setUser((current) => {
      if (!current) {
        return current;
      }

      const nextUser = { ...current, ...updates };
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      return nextUser;
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
    persistAuth(data);
    toast.success('Login successful');
    return data.user;
  }, [persistAuth]);

  const register = useCallback(async (data: { full_name: string; email: string; password: string; role: Exclude<UserRole, 'admin'>; }) => {
    await api.post('/auth/register', data);
    toast.success('Registration successful');
  }, []);

  const handleGoogleCallback = useCallback(async (payload: { code: string; code_verifier: string; state: string; nonce?: string }) => {
    const { data } = await api.post<AuthResponse>('/auth/google/callback', payload);
    persistAuth(data);
    return data.user;
  }, [persistAuth]);

  const logout = useCallback(() => {
    clearAuth();
    toast.success('Logged out');
    navigate('/login', { replace: true });
  }, [clearAuth, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      loading,
      login,
      register,
      handleGoogleCallback,
      updateUser,
      logout,
    }),
    [handleGoogleCallback, loading, login, logout, register, token, updateUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export const authStorageKeys = {
  token: TOKEN_KEY,
  user: USER_KEY,
};
