import { exportPKCS8, generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { sha256Hex, verifyAppleIdentityToken } from './lib/apple';
import { isAllowedRedirect } from './lib/authRedirect';
import { findOrCreateUser, refreshEmail } from './lib/authUsers';
import { setup, signedInUser } from './test.setup';

describe('isAllowedRedirect', () => {
  test('allows the app scheme and the delete-account page', () => {
    expect(isAllowedRedirect('grocr:///', false)).toBe(true);
    expect(isAllowedRedirect('https://grocr.io/delete-account', false)).toBe(true);
    expect(isAllowedRedirect('https://grocr.io/delete-account?lang=en', false)).toBe(true);
  });

  test('refuses other sites, look-alikes and Expo Go unless enabled', () => {
    expect(isAllowedRedirect('https://evil.example/delete-account', false)).toBe(false);
    expect(isAllowedRedirect('https://grocr.io.evil.example/delete-account', false)).toBe(false);
    expect(isAllowedRedirect('https://grocr.io@evil.example/delete-account', false)).toBe(false);
    expect(isAllowedRedirect('http://grocr.io/delete-account', false)).toBe(false);
    expect(isAllowedRedirect('https://grocr.io/join', false)).toBe(false);
    expect(isAllowedRedirect('/relative', false)).toBe(false);
    expect(isAllowedRedirect('exp://u.expo.dev/abc/--/', false)).toBe(false);
    expect(isAllowedRedirect('exp://u.expo.dev/abc/--/', true)).toBe(true);
  });
});

describe('findOrCreateUser', () => {
  test('links a verified email to the one verified user who has it', async () => {
    const t = setup();
    const existing = await t.run((ctx) =>
      ctx.db.insert('users', {
        name: 'Kari',
        email: 'kari@example.com',
        emailVerificationTime: 1,
      }),
    );
    const linked = await t.run((ctx) =>
      findOrCreateUser(ctx, 'google', { email: 'Kari@Example.com', emailVerified: true }),
    );
    expect(linked).toBe(existing);
  });

  test('never links unverified emails or test users', async () => {
    const t = setup();
    const existing = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'kari@example.com', emailVerificationTime: 1 }),
    );
    const unverified = await t.run((ctx) =>
      findOrCreateUser(ctx, 'google', { email: 'kari@example.com', emailVerified: false }),
    );
    const dev = await t.run((ctx) =>
      findOrCreateUser(ctx, 'dev', { email: 'kari@example.com', emailVerificationTime: 1 }),
    );
    expect(unverified).not.toBe(existing);
    expect(dev).not.toBe(existing);
    await t.run(async (ctx) => {
      expect((await ctx.db.get('users', unverified))?.emailVerificationTime).toBeUndefined();
    });
  });

  test('creates a user with a tidied name and verified email', async () => {
    const t = setup();
    const id = await t.run((ctx) =>
      findOrCreateUser(ctx, 'apple', {
        name: '  Ola   Nordmann ',
        email: 'ola@privaterelay.appleid.com',
        emailVerificationTime: 5,
      }),
    );
    await t.run(async (ctx) => {
      const user = await ctx.db.get('users', id);
      expect(user?.name).toBe('Ola Nordmann');
      expect(user?.email).toBe('ola@privaterelay.appleid.com');
      expect(user?.emailVerificationTime).toBeTypeOf('number');
    });
  });
});

describe('refreshEmail', () => {
  test('stores a changed verified email, ignores unverified ones and test users', async () => {
    const t = setup();
    const id = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'old@example.com', emailVerificationTime: 1 }),
    );
    await t.run((ctx) => refreshEmail(ctx.db, id, 'google', { email: 'x@example.com' }));
    await t.run((ctx) =>
      refreshEmail(ctx.db, id, 'dev', { email: 'y@example.com', emailVerified: true }),
    );
    expect((await t.run((ctx) => ctx.db.get('users', id)))?.email).toBe('old@example.com');
    await t.run((ctx) =>
      refreshEmail(ctx.db, id, 'google', { email: 'New@Example.com', emailVerified: true }),
    );
    expect((await t.run((ctx) => ctx.db.get('users', id)))?.email).toBe('new@example.com');
  });
});

describe('verifyAppleIdentityToken', () => {
  async function appleToken(claims: Record<string, unknown>, expires = '5m') {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://appleid.apple.com')
      .setSubject('apple-sub')
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(privateKey);
    return { token, keys: createLocalJWKSet({ keys: [jwk] }) };
  }

  test('accepts a token for our audience with the hashed nonce', async () => {
    const { token, keys } = await appleToken({
      aud: 'com.grocr.app',
      nonce: await sha256Hex('raw'),
      email: 'a@b.no',
      email_verified: 'true',
    });
    const claims = await verifyAppleIdentityToken(token, 'raw', ['com.grocr.app'], keys);
    expect(claims.sub).toBe('apple-sub');
    expect(claims.aud).toBe('com.grocr.app');
  });

  test('rejects a wrong nonce, audience, expired token or missing audiences', async () => {
    const nonce = await sha256Hex('raw');
    const good = await appleToken({ aud: 'com.grocr.app', nonce });
    await expect(
      verifyAppleIdentityToken(good.token, 'other', ['com.grocr.app'], good.keys),
    ).rejects.toThrow();
    await expect(
      verifyAppleIdentityToken(good.token, 'raw', ['io.grocr.web'], good.keys),
    ).rejects.toThrow();
    await expect(verifyAppleIdentityToken(good.token, 'raw', [], good.keys)).rejects.toThrow();
    const unhashed = await appleToken({ aud: 'com.grocr.app', nonce: 'raw' });
    await expect(
      verifyAppleIdentityToken(unhashed.token, 'raw', ['com.grocr.app'], unhashed.keys),
    ).rejects.toThrow();
    const expired = await appleToken({ aud: 'com.grocr.app', nonce }, '-1m');
    await expect(
      verifyAppleIdentityToken(expired.token, 'raw', ['com.grocr.app'], expired.keys),
    ).rejects.toThrow();
  });
});

describe('Apple token revocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  test('save keeps one token per user and client id', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'Ada');
    const args = { userId: ada.userId, clientId: 'com.grocr.app' };
    await t.mutation(internal.appleTokens.save, { ...args, refreshToken: 'r1' });
    await t.mutation(internal.appleTokens.save, { ...args, refreshToken: 'r2' });
    const tokens = await t.query(internal.appleTokens.forUser, { userId: ada.userId });
    expect(tokens.map((token) => token.refreshToken)).toEqual(['r2']);
  });

  test('deleting the account revokes the Apple token and forgets it', async () => {
    vi.useFakeTimers();
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY1234567');
    vi.stubEnv('APPLE_PRIVATE_KEY', (await exportPKCS8(privateKey)).replace(/\n/g, '\\n'));
    const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const t = setup();
    const ada = await signedInUser(t, 'Ada');
    await t.mutation(internal.appleTokens.save, {
      userId: ada.userId,
      clientId: 'com.grocr.app',
      refreshToken: 'r1',
    });
    await ada.as.mutation(api.account.deleteAccount, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('token')).toBe('r1');
    expect(body.get('client_id')).toBe('com.grocr.app');
    expect(body.get('client_secret')?.split('.')).toHaveLength(3);
    expect(await t.query(internal.appleTokens.forUser, { userId: ada.userId })).toEqual([]);
  });

  test('a token saved after the account is gone is revoked, not kept', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'Ada');
    await t.run((ctx) => ctx.db.delete('users', ada.userId));
    await t.mutation(internal.appleTokens.save, {
      userId: ada.userId,
      clientId: 'com.grocr.app',
      refreshToken: 'late',
    });
    expect(await t.query(internal.appleTokens.forUser, { userId: ada.userId })).toEqual([]);
    await t.run(async (ctx) => {
      const scheduled = await ctx.db.system.query('_scheduled_functions').collect();
      expect(scheduled.map((job) => job.name)).toEqual(['appleTokens:revokeOne']);
    });
  });

  test('a user without Apple tokens schedules nothing', async () => {
    const t = setup();
    const bo = await signedInUser(t, 'Bo');
    await bo.as.mutation(api.account.deleteAccount, {});
    await t.run(async (ctx) => {
      expect(await ctx.db.system.query('_scheduled_functions').collect()).toEqual([]);
    });
  });
});
