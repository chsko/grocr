import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';

describe('users.me and groups.create', () => {
  test('signed out returns null; new users have no family until they create one', async () => {
    const t = setup();
    expect(await t.query(api.users.me, {})).toBeNull();
    const kari = await signedInUser(t, 'Kari');
    expect((await kari.as.query(api.users.me, {}))?.family).toBeNull();

    const groupId = await kari.as.mutation(api.groups.create, {
      name: '  hansen family ',
      timezone: 'Not/AZone',
    });
    const me = await kari.as.query(api.users.me, {});
    expect(me?.family).toMatchObject({
      groupId,
      name: 'Hansen family',
      role: 'owner',
      weekStartsOn: 1,
      timezone: 'Europe/Oslo',
    });
    await expect(
      kari.as.mutation(api.groups.create, { name: 'Second', timezone: 'Europe/Oslo' }),
    ).rejects.toThrow(/ALREADY_IN_FAMILY/);
  });

  test('requires a name', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    await expect(
      kari.as.mutation(api.groups.create, { name: '   ', timezone: 'Europe/Oslo' }),
    ).rejects.toThrow(/NAME_REQUIRED/);
  });

  test('any member can rename the family, but not to nothing', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
    await ola.as.mutation(api.groups.rename, { groupId, name: '  familien berg ' });
    expect((await kari.as.query(api.users.me, {}))?.family?.name).toBe('Familien berg');
    await expect(ola.as.mutation(api.groups.rename, { groupId, name: '  ' })).rejects.toThrow(
      /NAME_REQUIRED/,
    );
  });
});

describe('members and ownership', () => {
  test('lists members owner first, marks the caller', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
    const members = await ola.as.query(api.groups.members, { groupId });
    expect(members.map((m) => [m.name, m.role, m.isMe])).toEqual([
      ['Kari', 'owner', false],
      ['Ola', 'member', true],
    ]);
  });

  test('only the owner removes members, and not themselves', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
    const [owner, member] = await kari.as.query(api.groups.members, { groupId });

    await expect(
      ola.as.mutation(api.groups.removeMember, { membershipId: owner.membershipId }),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      kari.as.mutation(api.groups.removeMember, { membershipId: owner.membershipId }),
    ).rejects.toThrow(/CANNOT_REMOVE_SELF/);
    await kari.as.mutation(api.groups.removeMember, { membershipId: member.membershipId });
    expect((await ola.as.query(api.users.me, {}))?.family).toBeNull();
  });

  test('transferring ownership swaps roles', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
    const [, member] = await kari.as.query(api.groups.members, { groupId });
    await kari.as.mutation(api.groups.transferOwnership, { membershipId: member.membershipId });
    expect((await ola.as.query(api.users.me, {}))?.family?.role).toBe('owner');
    expect((await kari.as.query(api.users.me, {}))?.family?.role).toBe('member');
    const group = await t.run((ctx) => ctx.db.get('groups', groupId));
    expect(group?.ownerId).toBe(ola.userId);
  });

  test("a change of owner revokes the old owner's invite", async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const groupId = await groupWithMembers(t, [kari.userId, ola.userId]);
    const { code } = await kari.as.mutation(api.invites.create, { groupId });
    await kari.as.mutation(api.groups.leave, { groupId });
    const emma = await signedInUser(t, 'Emma');
    expect(await emma.as.mutation(api.invites.accept, { code })).toEqual({ status: 'invalid' });
  });

  test('an owner leaving hands ownership to the longest-standing member', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    const emma = await signedInUser(t, 'Emma');
    const groupId = await groupWithMembers(t, [kari.userId, ola.userId, emma.userId]);
    await kari.as.mutation(api.groups.leave, { groupId });
    expect((await ola.as.query(api.users.me, {}))?.family?.role).toBe('owner');
    expect((await emma.as.query(api.users.me, {}))?.family?.role).toBe('member');
  });

  test('the last member leaving deletes the family and its content', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const groupId = await groupWithMembers(t, [kari.userId]);
    await kari.as.mutation(api.recipes.save, {
      groupId,
      title: 'Tacos',
      servings: 4,
      steps: [],
      ingredients: [{ name: 'Onion', qty: 2, unit: 'pcs' }],
    });
    await kari.as.mutation(api.groups.leave, { groupId });
    const left = await t.run(async (ctx) => ({
      groups: await ctx.db.query('groups').collect(),
      recipes: await ctx.db.query('recipes').collect(),
      ingredients: await ctx.db.query('ingredients').collect(),
    }));
    expect(left).toEqual({ groups: [], recipes: [], ingredients: [] });
  });

  test("other families can't see or manage members", async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const eve = await signedInUser(t, 'Eve');
    const groupId = await groupWithMembers(t, [kari.userId]);
    await groupWithMembers(t, [eve.userId]);
    const [owner] = await kari.as.query(api.groups.members, { groupId });
    await expect(eve.as.query(api.groups.members, { groupId })).rejects.toThrow(/NOT_FOUND/);
    await expect(
      eve.as.mutation(api.groups.removeMember, { membershipId: owner.membershipId }),
    ).rejects.toThrow(/NOT_FOUND/);
    await expect(eve.as.mutation(api.groups.rename, { groupId, name: 'Mine' })).rejects.toThrow(
      /NOT_FOUND/,
    );
    await expect(eve.as.mutation(api.groups.leave, { groupId })).rejects.toThrow(/NOT_FOUND/);
  });
});
