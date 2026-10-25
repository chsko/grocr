import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from 'jose';

// Sign in with Apple (GRO-21). The app (and the grocr.io delete page) get an identity token from
// Apple and send it with the raw nonce; we verify it here instead of running Apple's web OAuth
// flow, so no client secret has to be rotated every six months. The private key is only used
// to mint short-lived client secrets for exchanging and revoking tokens.

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

/**
 * Client ids whose identity tokens we accept: the app's bundle id and the web Services ID,
 * from `APPLE_AUDIENCES` (comma separated). Dev can add `host.exp.Exponent` for Expo Go.
 */
export function appleAudiences(): string[] {
  return (process.env.APPLE_AUDIENCES ?? '')
    .split(',')
    .map((audience: string) => audience.trim())
    .filter((audience: string) => audience !== '');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type AppleClaims = JWTPayload & {
  sub: string;
  aud: string;
  email?: string;
  email_verified?: boolean | 'true' | 'false';
  nonce?: string;
};

/**
 * Checks Apple's signature, issuer, audience and expiry, and that the token's nonce is the
 * SHA-256 of `rawNonce`: the client sends Apple only the hash, so a leaked token can't be
 * replayed without the raw value. Throws on any mismatch.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce: string,
  audiences: string[],
  keys: Parameters<typeof jwtVerify>[1] = appleKeys,
): Promise<AppleClaims> {
  if (audiences.length === 0) throw new Error('APPLE_AUDIENCES is not set');
  const { payload } = await jwtVerify(identityToken, keys as typeof appleKeys, {
    issuer: APPLE_ISSUER,
    audience: audiences,
    algorithms: ['RS256'],
  });
  if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('No subject');
  if (payload.nonce !== (await sha256Hex(rawNonce))) throw new Error('Nonce mismatch');
  const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  return { ...payload, sub: payload.sub, aud: aud ?? '' } as AppleClaims;
}

export function appleEmailVerified(claims: AppleClaims): boolean {
  return claims.email_verified === true || claims.email_verified === 'true';
}

/** True when the key needed to exchange and revoke tokens is configured. */
export function appleKeyConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY,
  );
}

async function clientSecret(clientId: string): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const pem = process.env.APPLE_PRIVATE_KEY;
  if (!teamId || !keyId || !pem) throw new Error('Apple key is not configured');
  // Pasted keys sometimes arrive with literal "\n" instead of line breaks.
  const key = await importPKCS8(pem.replace(/\\n/g, '\n').trim(), 'ES256');
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

async function postForm(path: string, form: Record<string, string>) {
  return await fetch(`${APPLE_ISSUER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

/** Exchanges the one-time authorization code for a refresh token we can revoke later. */
export async function exchangeAppleCode(
  clientId: string,
  code: string,
  redirectUri?: string,
): Promise<string> {
  const response = await postForm('/auth/token', {
    client_id: clientId,
    client_secret: await clientSecret(clientId),
    code,
    grant_type: 'authorization_code',
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  });
  if (!response.ok) throw new Error(`Apple token exchange failed: ${response.status}`);
  const body = (await response.json()) as { refresh_token?: unknown };
  if (typeof body.refresh_token !== 'string') throw new Error('Apple sent no refresh token');
  return body.refresh_token;
}

/** Revokes a refresh token, which removes Grocr from the user's Apple ID settings. */
export async function revokeAppleToken(clientId: string, refreshToken: string): Promise<void> {
  const response = await postForm('/auth/revoke', {
    client_id: clientId,
    client_secret: await clientSecret(clientId),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  if (!response.ok) throw new Error(`Apple revoke failed: ${response.status}`);
}
