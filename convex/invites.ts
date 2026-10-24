import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { accessError, currentMembership, requireOwner, requireUserId } from './lib/access';
import { CODE_LENGTH, normalizeCode } from './lib/inviteCode';

// Invite codes (GRO-25): single use, 48 hours, one active code per family. The code is what
// people type, so it avoids look-alike characters. Links on grocr.com come with GRO-39.

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Failed lookups allowed per user per window; 31^6 codes make guessing hopeless at this rate.
export const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;

function randomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 % 31 leaves a tiny bias, irrelevant for a 48-hour single-use code.
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isActive(invite: Doc<'invites'>, now: number) {
  return invite.revokedAt === undefined && invite.uses < invite.maxUses && invite.expiresAt > now;
}

/** Creates a new code for the family and revokes any older unused one. Owner only. */
export const create = mutation({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { userId } = await requireOwner(ctx, groupId);
    const now = Date.now();
    const existing = await ctx.db
      .query('invites')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    for (const invite of existing) {
      if (isActive(invite, now)) await ctx.db.patch('invites', invite._id, { revokedAt: now });
    }
    let shortCode = randomCode();
    // A clash with any stored code (even an expired one) is astronomically rare; just redraw.
    while (
      (await ctx.db
        .query('invites')
        .withIndex('by_shortCode', (q) => q.eq('shortCode', shortCode))
        .first()) !== null
    ) {
      shortCode = randomCode();
    }
    const expiresAt = now + INVITE_TTL_MS;
    await ctx.db.insert('invites', {
      groupId,
      tokenHash: await sha256(shortCode),
      shortCode,
      createdBy: userId,
      expiresAt,
      maxUses: 1,
      uses: 0,
    });
    return { code: shortCode, expiresAt };
  },
});

/** The family's current unused code, for the owner; null for members or when there is none. */
export const active = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    try {
      await requireOwner(ctx, groupId);
    } catch (error) {
      if (error instanceof ConvexError && error.data.code === 'FORBIDDEN') return null;
      throw error;
    }
    const now = Date.now();
    const invites = await ctx.db
      .query('invites')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    const invite = invites
      .filter((i) => isActive(i, now))
      .sort((a, b) => b.expiresAt - a.expiresAt)[0];
    return invite
      ? { inviteId: invite._id, code: invite.shortCode, expiresAt: invite.expiresAt }
      : null;
  },
});

export const revoke = mutation({
  args: { inviteId: v.id('invites') },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get('invites', inviteId);
    if (invite === null) throw accessError('NOT_FOUND');
    await requireOwner(ctx, invite.groupId);
    if (invite.revokedAt === undefined) {
      await ctx.db.patch('invites', inviteId, { revokedAt: Date.now() });
    }
  },
});

type Lookup =
  | { status: 'invalid' }
  | { status: 'rateLimited' }
  | { status: 'ok'; invite: Doc<'invites'>; userId: Id<'users'> };

/**
 * Finds an active invite by code and counts failed attempts per user. Never throws for a bad
 * code, so the failure count is committed with the mutation.
 */
async function lookup(ctx: MutationCtx, code: string): Promise<Lookup> {
  const userId = await requireUserId(ctx);
  const now = Date.now();
  const attempts = await ctx.db
    .query('inviteAttempts')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const windowOpen = attempts !== null && now - attempts.windowStart < FAILURE_WINDOW_MS;
  if (windowOpen && attempts.failures >= MAX_FAILURES) return { status: 'rateLimited' };

  const shortCode = normalizeCode(code);
  const invite =
    shortCode.length === CODE_LENGTH
      ? await ctx.db
          .query('invites')
          .withIndex('by_shortCode', (q) => q.eq('shortCode', shortCode))
          .first()
      : null;
  if (invite !== null && isActive(invite, now)) return { status: 'ok', invite, userId };

  if (attempts === null) {
    await ctx.db.insert('inviteAttempts', { userId, windowStart: now, failures: 1 });
  } else if (windowOpen) {
    await ctx.db.patch('inviteAttempts', attempts._id, { failures: attempts.failures + 1 });
  } else {
    await ctx.db.patch('inviteAttempts', attempts._id, { windowStart: now, failures: 1 });
  }
  return { status: 'invalid' };
}

/** Shows who invited you and to which family before you join. A mutation so failures count. */
export const preview = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const result = await lookup(ctx, code);
    if (result.status !== 'ok') return { status: result.status };
    const { invite } = result;
    const group = await ctx.db.get('groups', invite.groupId);
    const inviter = await ctx.db.get('users', invite.createdBy);
    if (group === null) return { status: 'invalid' as const };
    const members = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', group._id))
      .collect();
    const recipes = await ctx.db
      .query('recipes')
      .withIndex('by_group', (q) => q.eq('groupId', group._id))
      .collect();
    return {
      status: 'ok' as const,
      familyName: group.name,
      inviterName: inviter?.name ?? '',
      memberCount: members.length,
      recipeCount: recipes.filter((r) => r.archivedAt === undefined).length,
    };
  },
});

/** Joins the family behind a code. Joining a family you are already in is a no-op. */
export const accept = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const result = await lookup(ctx, code);
    if (result.status !== 'ok') return { status: result.status };
    const { invite, userId } = result;
    const current = await currentMembership(ctx, userId);
    if (current?.groupId === invite.groupId)
      return { status: 'ok' as const, groupId: invite.groupId };
    if (current !== null) throw new ConvexError({ code: 'ALREADY_IN_FAMILY' });
    await ctx.db.patch('invites', invite._id, { uses: invite.uses + 1 });
    await ctx.db.insert('memberships', {
      groupId: invite.groupId,
      userId,
      role: 'member',
      joinedAt: Date.now(),
    });
    return { status: 'ok' as const, groupId: invite.groupId };
  },
});
