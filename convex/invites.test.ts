import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { INVITE_TTL_MS, MAX_FAILURES } from './invites';
import { groupWithMembers, setup, signedInUser } from './test.setup';

async function family() {
  const t = setup();
  const kari = await signedInUser(t, 'Kari');
  const groupId = await groupWithMembers(t, [kari.userId]);
  return { t, kari, groupId };
}

describe('invites', () => {
  test('owner creates a code, a new user previews and joins with it', async () => {
    const { t, kari, groupId } = await family();
    const { code } = await kari.as.mutation(api.invites.create, { groupId });
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect((await kari.as.query(api.invites.active, { groupId }))?.code).toBe(code);

    const ola = await signedInUser(t, 'Ola');
    const typed = `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`;
    expect(await ola.as.mutation(api.invites.preview, { code: typed })).toEqual({
      status: 'ok',
      familyName: 'Family',
      inviterName: 'Kari',
      memberCount: 1,
      recipeCount: 0,
    });
    expect(await ola.as.mutation(api.invites.accept, { code: typed })).toEqual({
      status: 'ok',
      groupId,
    });
    expect((await ola.as.query(api.users.me, {}))?.family?.role).toBe('member');
    // Single use: the code is gone for the next person, and no longer shown as active.
    const emma = await signedInUser(t, 'Emma');
    expect(await emma.as.mutation(api.invites.accept, { code })).toEqual({ status: 'invalid' });
    expect(await kari.as.query(api.invites.active, { groupId })).toBeNull();
  });

  test('accepting twice is harmless; members of another family are refused', async () => {
    const { t, kari, groupId } = await family();
    const { code } = await kari.as.mutation(api.invites.create, { groupId });
    const eve = await signedInUser(t, 'Eve');
    await groupWithMembers(t, [eve.userId]);
    await expect(eve.as.mutation(api.invites.accept, { code })).rejects.toThrow(
      /ALREADY_IN_FAMILY/,
    );
    expect(await kari.as.mutation(api.invites.accept, { code })).toEqual({ status: 'ok', groupId });
  });

  test('a new code revokes the old one; revoked and expired codes fail', async () => {
    const { t, kari, groupId } = await family();
    const first = await kari.as.mutation(api.invites.create, { groupId });
    const second = await kari.as.mutation(api.invites.create, { groupId });
    const ola = await signedInUser(t, 'Ola');
    expect(await ola.as.mutation(api.invites.preview, { code: first.code })).toEqual({
      status: 'invalid',
    });

    const active = await kari.as.query(api.invites.active, { groupId });
    await kari.as.mutation(api.invites.revoke, { inviteId: active!.inviteId });
    expect(await ola.as.mutation(api.invites.preview, { code: second.code })).toEqual({
      status: 'invalid',
    });

    const third = await kari.as.mutation(api.invites.create, { groupId });
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query('invites')
        .withIndex('by_shortCode', (q) => q.eq('shortCode', third.code))
        .unique();
      await ctx.db.patch('invites', invite!._id, { expiresAt: Date.now() - 1 });
    });
    expect(third.expiresAt - Date.now()).toBeLessThanOrEqual(INVITE_TTL_MS);
    expect(await ola.as.mutation(api.invites.accept, { code: third.code })).toEqual({
      status: 'invalid',
    });
  });

  test('wrong codes are rate limited per user', async () => {
    const { t, kari, groupId } = await family();
    const { code } = await kari.as.mutation(api.invites.create, { groupId });
    const ola = await signedInUser(t, 'Ola');
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(await ola.as.mutation(api.invites.preview, { code: 'ZZZZZZ' })).toEqual({
        status: 'invalid',
      });
    }
    // Even the right code is refused until the window passes.
    expect(await ola.as.mutation(api.invites.accept, { code })).toEqual({ status: 'rateLimited' });
  });

  test('only the owner creates, sees and revokes codes', async () => {
    const { t, kari, groupId } = await family();
    const ola = await signedInUser(t, 'Ola');
    const eve = await signedInUser(t, 'Eve');
    await t.run((ctx) =>
      ctx.db.insert('memberships', { groupId, userId: ola.userId, role: 'member', joinedAt: 1 }),
    );
    await groupWithMembers(t, [eve.userId]);
    await kari.as.mutation(api.invites.create, { groupId });
    const active = await kari.as.query(api.invites.active, { groupId });

    await expect(ola.as.mutation(api.invites.create, { groupId })).rejects.toThrow(/FORBIDDEN/);
    expect(await ola.as.query(api.invites.active, { groupId })).toBeNull();
    await expect(
      ola.as.mutation(api.invites.revoke, { inviteId: active!.inviteId }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(eve.as.mutation(api.invites.create, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.query(api.invites.active, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.invites.revoke, { inviteId: active!.inviteId }),
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
