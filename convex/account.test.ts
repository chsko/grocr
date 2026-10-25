import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { groupWithMembers, setup, signedInUser } from './test.setup';

const MONDAY = '2026-10-26';

describe('account.deleteAccount', () => {
  test('hands the family on, removes the name from shared data and deletes sign-in data', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'Ada');
    const bo = await signedInUser(t, 'Bo');
    const groupId = await groupWithMembers(t, [ada.userId, bo.userId]);
    const recipeId = await ada.as.mutation(api.recipes.save, {
      groupId,
      title: 'Tacos',
      servings: 4,
      steps: [],
      ingredients: [{ name: 'Onion', qty: 1, unit: 'pcs' }],
    });
    await ada.as.mutation(api.mealPlan.set, { groupId, date: MONDAY, recipeId, servings: 4 });
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Milk' });
    await ada.as.mutation(api.invites.create, { groupId });
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert('authSessions', {
        userId: ada.userId,
        expirationTime: Date.now() + 1000,
      });
      await ctx.db.insert('authRefreshTokens', {
        sessionId,
        expirationTime: Date.now() + 1000,
      });
      await ctx.db.insert('authAccounts', {
        userId: ada.userId,
        provider: 'dev',
        providerAccountId: 'dev-ada',
      });
    });

    await ada.as.mutation(api.account.deleteAccount, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get('users', ada.userId)).toBeNull();
      expect(await ctx.db.query('authSessions').collect()).toEqual([]);
      expect(await ctx.db.query('authRefreshTokens').collect()).toEqual([]);
      expect(await ctx.db.query('authAccounts').collect()).toEqual([]);
      expect(await ctx.db.query('invites').collect()).toEqual([]);
      const group = await ctx.db.get('groups', groupId);
      expect(group?.ownerId).toBe(bo.userId);
      const recipe = await ctx.db.get('recipes', recipeId);
      expect(recipe?.createdBy).toBeUndefined();
      const entries = await ctx.db.query('mealPlanEntries').collect();
      expect(entries.map((e) => e.addedBy)).toEqual([undefined]);
      const items = await ctx.db.query('groceryItems').collect();
      const users = new Set<string>();
      for (const item of items) {
        if (item.source.kind === 'manual' && item.source.addedBy) users.add(item.source.addedBy);
        if (item.checkedBy) users.add(item.checkedBy);
      }
      expect(users.has(ada.userId)).toBe(false);
    });
    const members = await bo.as.query(api.groups.members, { groupId });
    expect(members.map((m) => [m.name, m.role])).toEqual([['Bo', 'owner']]);
    const list = await bo.as.query(api.grocery.listForWeek, { groupId, startDate: MONDAY });
    expect(list.items.map((i) => i.name).sort()).toEqual(['Milk', 'Onion']);
  });

  test('the last member deleting their account deletes the family', async () => {
    const t = setup();
    const ada = await signedInUser(t, 'Ada');
    const groupId = await groupWithMembers(t, [ada.userId]);
    await ada.as.mutation(api.grocery.addManual, { groupId, startDate: MONDAY, name: 'Milk' });
    await ada.as.mutation(api.account.deleteAccount, {});
    await t.run(async (ctx) => {
      expect(await ctx.db.get('groups', groupId)).toBeNull();
      expect(await ctx.db.query('groceryItems').collect()).toEqual([]);
      expect(await ctx.db.query('ingredients').collect()).toEqual([]);
    });
  });

  test("a deleted user's leftover access token is refused", async () => {
    const t = setup();
    const ada = await signedInUser(t, 'Ada');
    const bo = await signedInUser(t, 'Bo');
    const groupId = await groupWithMembers(t, [bo.userId]);
    const { code } = await bo.as.mutation(api.invites.create, { groupId });
    await ada.as.mutation(api.account.deleteAccount, {});
    await expect(ada.as.mutation(api.invites.accept, { code })).rejects.toThrow(/UNAUTHENTICATED/);
    await expect(
      ada.as.mutation(api.groups.create, { name: 'Ghost', timezone: 'Europe/Oslo' }),
    ).rejects.toThrow(/UNAUTHENTICATED/);
  });

  test('signed-out callers are rejected', async () => {
    const t = setup();
    await expect(t.mutation(api.account.deleteAccount, {})).rejects.toThrow();
  });
});
