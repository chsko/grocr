import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { setup } from './test.setup';

// Convex Auth signs session JWTs with JWT_PRIVATE_KEY; give it a throwaway key.
let jwtPrivateKey: string;
beforeAll(async () => {
  const { privateKey } = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey));
  jwtPrivateKey = `-----BEGIN PRIVATE KEY----- ${btoa(String.fromCharCode(...pkcs8))} -----END PRIVATE KEY-----`;
});

function withDevSignIn(value: 'enabled' | undefined) {
  vi.stubEnv('JWT_PRIVATE_KEY', jwtPrivateKey);
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
  vi.stubEnv('GROCR_DEV_SIGN_IN', value);
  return setup();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dev sign-in', () => {
  test('is disabled unless GROCR_DEV_SIGN_IN=enabled', async () => {
    const t = withDevSignIn(undefined);
    expect(await t.query(api.devSignIn.personas, {})).toEqual([]);
    await expect(
      t.action(api.auth.signIn, { provider: 'dev', params: { persona: 'kari' } }),
    ).rejects.toThrow(/DEV_SIGN_IN_DISABLED/);
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toEqual([]);
  });

  test('lists the test users', async () => {
    const t = withDevSignIn('enabled');
    const personas = await t.query(api.devSignIn.personas, {});
    expect(personas.map((p) => p.id)).toEqual(['kari', 'ola', 'emma', 'ingrid']);
  });

  test('signs in as a test user and reuses the account next time', async () => {
    const t = withDevSignIn('enabled');
    const args = { provider: 'dev', params: { persona: 'kari' } };
    const result = await t.action(api.auth.signIn, args);
    expect(result.tokens?.token).toEqual(expect.any(String));
    await t.action(api.auth.signIn, args);
    const users = await t.run((ctx) => ctx.db.query('users').collect());
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ name: 'Kari Hansen', email: 'kari@example.no' });
  });

  test('rejects unknown personas', async () => {
    const t = withDevSignIn('enabled');
    await expect(
      t.action(api.auth.signIn, { provider: 'dev', params: { persona: 'toString' } }),
    ).rejects.toThrow(/UNKNOWN_PERSONA/);
  });
});
