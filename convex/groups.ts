import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import {
  accessError,
  currentMembership,
  requireMembership,
  requireOwner,
  requireUserId,
} from './lib/access';
import { cleanName } from './lib/catalog';

function validName(name: string) {
  const clean = cleanName(name).slice(0, 60);
  if (clean === '') throw new ConvexError({ code: 'NAME_REQUIRED' });
  return clean;
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return timezone;
  } catch {
    return 'Europe/Oslo';
  }
}

/** Creates a family with the caller as owner. One family per person in the v1 UI (GRO-12). */
export const create = mutation({
  args: { name: v.string(), timezone: v.string() },
  handler: async (ctx, { name, timezone }) => {
    const userId = await requireUserId(ctx);
    if ((await currentMembership(ctx, userId)) !== null) {
      throw new ConvexError({ code: 'ALREADY_IN_FAMILY' });
    }
    const now = Date.now();
    const groupId = await ctx.db.insert('groups', {
      name: validName(name),
      ownerId: userId,
      weekStartsOn: 1,
      timezone: validTimezone(timezone),
      createdAt: now,
    });
    await ctx.db.insert('memberships', { groupId, userId, role: 'owner', joinedAt: now });
    return groupId;
  },
});

export const rename = mutation({
  args: { groupId: v.id('groups'), name: v.string() },
  handler: async (ctx, { groupId, name }) => {
    await requireOwner(ctx, groupId);
    await ctx.db.patch('groups', groupId, { name: validName(name) });
  },
});

/** Members, owner first, then by join date. */
export const members = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    const rows = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get('users', m.userId);
        return {
          membershipId: m._id,
          name: user?.name ?? '',
          role: m.role,
          joinedAt: m.joinedAt,
          isMe: m.userId === userId,
        };
      }),
    );
    return rows.sort(
      (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.joinedAt - b.joinedAt,
    );
  },
});

/** Loads a membership by id and checks the caller owns its family. */
async function ownedMembership(ctx: MutationCtx, membershipId: Id<'memberships'>) {
  const membership = await ctx.db.get('memberships', membershipId);
  if (membership === null) throw accessError('NOT_FOUND');
  const access = await requireOwner(ctx, membership.groupId);
  return { target: membership, mine: access.membership };
}

export const removeMember = mutation({
  args: { membershipId: v.id('memberships') },
  handler: async (ctx, { membershipId }) => {
    const { target, mine } = await ownedMembership(ctx, membershipId);
    if (target._id === mine._id) throw new ConvexError({ code: 'CANNOT_REMOVE_SELF' });
    await ctx.db.delete('memberships', membershipId);
  },
});

export const transferOwnership = mutation({
  args: { membershipId: v.id('memberships') },
  handler: async (ctx, { membershipId }) => {
    const { target, mine } = await ownedMembership(ctx, membershipId);
    if (target._id === mine._id) return;
    await ctx.db.patch('memberships', target._id, { role: 'owner' });
    await ctx.db.patch('memberships', mine._id, { role: 'member' });
    await ctx.db.patch('groups', target.groupId, { ownerId: target.userId });
    await revokeInvites(ctx, target.groupId);
  },
});

/**
 * Leaves the family. An owner's role passes to the longest-standing member; the last member
 * leaving deletes the family and everything in it.
 */
export const leave = mutation({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { membership } = await requireMembership(ctx, groupId);
    await ctx.db.delete('memberships', membership._id);
    const rest = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    if (rest.length === 0) {
      await deleteGroup(ctx, groupId);
      return;
    }
    if (membership.role === 'owner' && !rest.some((m) => m.role === 'owner')) {
      const heir = rest.sort((a, b) => a.joinedAt - b.joinedAt)[0];
      await ctx.db.patch('memberships', heir._id, { role: 'owner' });
      await ctx.db.patch('groups', groupId, { ownerId: heir.userId });
      await revokeInvites(ctx, groupId);
    }
  },
});

/** Invites belong to the owner who made them; a new owner starts fresh. */
async function revokeInvites(ctx: MutationCtx, groupId: Id<'groups'>) {
  const now = Date.now();
  const invites = await ctx.db
    .query('invites')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  for (const invite of invites) {
    if (invite.revokedAt === undefined)
      await ctx.db.patch('invites', invite._id, { revokedAt: now });
  }
}

async function deleteGroup(ctx: MutationCtx, groupId: Id<'groups'>) {
  const invites = await ctx.db
    .query('invites')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  for (const doc of invites) await ctx.db.delete('invites', doc._id);
  const recipes = await ctx.db
    .query('recipes')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  for (const doc of recipes) await ctx.db.delete('recipes', doc._id);
  const ingredients = await ctx.db
    .query('ingredients')
    .withIndex('by_group_normalizedName', (q) => q.eq('groupId', groupId))
    .collect();
  for (const doc of ingredients) await ctx.db.delete('ingredients', doc._id);
  const entries = await ctx.db
    .query('mealPlanEntries')
    .withIndex('by_group_date', (q) => q.eq('groupId', groupId))
    .collect();
  for (const doc of entries) await ctx.db.delete('mealPlanEntries', doc._id);
  const lists = await ctx.db
    .query('groceryLists')
    .withIndex('by_group_startDate', (q) => q.eq('groupId', groupId))
    .collect();
  for (const list of lists) {
    const items = await ctx.db
      .query('groceryItems')
      .withIndex('by_list', (q) => q.eq('listId', list._id))
      .collect();
    for (const item of items) await ctx.db.delete('groceryItems', item._id);
    await ctx.db.delete('groceryLists', list._id);
  }
  await ctx.db.delete('groups', groupId);
}
