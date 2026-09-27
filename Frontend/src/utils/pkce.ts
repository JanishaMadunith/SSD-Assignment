// Web Crypto API PKCE helper according to RFC 7636 and OpenID Connect specifications

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

export async function initiateGoogleLogin(clientId?: string, redirectUri?: string) {
  const code_verifier = generateRandomString(64);
  const code_challenge = await generateCodeChallenge(code_verifier);
  const state = generateRandomString(32);
  const nonce = generateRandomString(32);

  sessionStorage.setItem('oidc_code_verifier', code_verifier);
  sessionStorage.setItem('oidc_state', state);
  sessionStorage.setItem('oidc_nonce', nonce);

  const googleClientId = clientId || process.env.REACT_APP_GOOGLE_CLIENT_ID;
  const targetRedirectUri = redirectUri || `${window.location.origin}/auth/callback`;

  const params = new URLSearchParams({
    client_id: googleClientId || '',
    redirect_uri: targetRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    access_type: 'offline'
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
