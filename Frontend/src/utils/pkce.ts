// Web Crypto API PKCE helper according to RFC 7636 and OpenID Connect specifications
import toast from 'react-hot-toast';
import api from '../services/api';

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generateRandomString(length: number = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (byte) => charset[byte % charset.length]).join('');
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

// Starts a Google login. The browser keeps only the PKCE verifier; the server
// issues state and nonce, records them, and returns the Google URL.
export async function initiateGoogleLogin() {
  const code_verifier = generateRandomString(64);
  const code_challenge = await generateCodeChallenge(code_verifier);

  try {
    const { data } = await api.post<{ url: string; state: string }>('/auth/google/start', {
      code_challenge,
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    sessionStorage.setItem('oidc_code_verifier', code_verifier);
    sessionStorage.setItem('oidc_state', data.state);
    window.location.href = data.url;
  } catch (_error) {
    toast.error('Google sign-in is not available right now');
  }
}
