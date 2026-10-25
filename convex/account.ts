import { mutation } from './_generated/server';
import { leaveFamily } from './groups';
import { requireUserId } from './lib/access';

/**
 * Deletes the signed-in user's account (App Store and Play require this in-app). They leave
 * every family, with ownership passing on and a last-member family deleted; their name is
 * removed from what stays behind (recipes, dinners, grocery lines); and their user, sign-in
 * accounts and sessions are deleted, which signs them out.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const membership of memberships) {
      const { groupId } = membership;
      const invites = await ctx.db
        .query('invites')
        .withIndex('by_group', (q) => q.eq('groupId', groupId))
        .collect();
      for (const invite of invites) {
        if (invite.createdBy === userId) await ctx.db.delete('invites', invite._id);
      }
      const recipes = await ctx.db
        .query('recipes')
        .withIndex('by_group', (q) => q.eq('groupId', groupId))
        .collect();
      for (const recipe of recipes) {
        if (recipe.createdBy === userId) {
          await ctx.db.patch('recipes', recipe._id, { createdBy: undefined });
        }
      }
      const entries = await ctx.db
        .query('mealPlanEntries')
        .withIndex('by_group_date', (q) => q.eq('groupId', groupId))
        .collect();
      for (const entry of entries) {
        if (entry.addedBy === userId) {
          await ctx.db.patch('mealPlanEntries', entry._id, { addedBy: undefined });
        }
      }
      const lists = await ctx.db
        .query('groceryLists')
        .withIndex('by_group_startDate', (q) => q.eq('groupId', groupId))
        .collect();
      for (const list of lists) {
        const items = await ctx.db
          .query('groceryItems')
          .withIndex('by_list', (q) => q.eq('listId', list._id))
          .collect();
        for (const item of items) {
          const manualByUser = item.source.kind === 'manual' && item.source.addedBy === userId;
          if (!manualByUser && item.checkedBy !== userId) continue;
          await ctx.db.patch('groceryItems', item._id, {
            ...(manualByUser ? { source: { kind: 'manual' as const } } : {}),
            ...(item.checkedBy === userId ? { checkedBy: undefined } : {}),
          });
        }
      }
      await leaveFamily(ctx, membership);
    }

    const attempts = await ctx.db
      .query('inviteAttempts')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const doc of attempts) await ctx.db.delete('inviteAttempts', doc._id);

    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect();
      for (const code of codes) await ctx.db.delete('authVerificationCodes', code._id);
      await ctx.db.delete('authAccounts', account._id);
    }
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect();
      for (const token of tokens) await ctx.db.delete('authRefreshTokens', token._id);
      await ctx.db.delete('authSessions', session._id);
    }
    await ctx.db.delete('users', userId);
  },
});
