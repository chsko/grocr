import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { revokeAppleToken } from './lib/apple';

const MAX_ATTEMPTS = 4;

/** One refresh token per user and Apple client id; a newer sign-in replaces the old one. */
export const save = internalMutation({
  args: { userId: v.id('users'), clientId: v.string(), refreshToken: v.string() },
  handler: async (ctx, { userId, clientId, refreshToken }) => {
    // A sign-in that finishes after the account was deleted must not leave a token behind.
    if ((await ctx.db.get('users', userId)) === null) {
      await ctx.scheduler.runAfter(0, internal.appleTokens.revokeOne, { clientId, refreshToken });
      return;
    }
    const existing = await ctx.db
      .query('appleTokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const doc of existing) {
      if (doc.clientId === clientId) await ctx.db.delete('appleTokens', doc._id);
    }
    await ctx.db.insert('appleTokens', { userId, clientId, refreshToken });
  },
});

export const forUser = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) =>
    await ctx.db
      .query('appleTokens')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect(),
});

export const remove = internalMutation({
  args: { id: v.id('appleTokens') },
  handler: async (ctx, { id }) => {
    if ((await ctx.db.get('appleTokens', id)) !== null) await ctx.db.delete('appleTokens', id);
  },
});

export const revokeOne = internalAction({
  args: { clientId: v.string(), refreshToken: v.string() },
  handler: async (_ctx, { clientId, refreshToken }) => {
    await revokeAppleToken(clientId, refreshToken);
  },
});

/**
 * Scheduled by account.deleteAccount (App Store review requires revoking Sign in with Apple).
 * Retries with backoff if Apple is unreachable, then gives up and drops the token.
 */
export const revokeForUser = internalAction({
  args: { userId: v.id('users'), attempt: v.optional(v.number()) },
  handler: async (ctx, { userId, attempt = 1 }) => {
    const tokens = await ctx.runQuery(internal.appleTokens.forUser, { userId });
    let failed = false;
    for (const token of tokens) {
      try {
        await revokeAppleToken(token.clientId, token.refreshToken);
      } catch (error) {
        console.warn('Apple revoke failed', error);
        if (attempt < MAX_ATTEMPTS) {
          failed = true;
          continue;
        }
      }
      try {
        await ctx.runMutation(internal.appleTokens.remove, { id: token._id });
      } catch (error) {
        console.warn('Could not forget a revoked Apple token', error);
        failed = attempt < MAX_ATTEMPTS;
      }
    }
    if (failed) {
      await ctx.scheduler.runAfter(60_000 * 4 ** attempt, internal.appleTokens.revokeForUser, {
        userId,
        attempt: attempt + 1,
      });
    }
  },
});
