import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { claimAdventRecipient, forgetAdventFamilyMember } from './advent';
import { requireMemberOf, requireMembership, requireOwner } from './lib/access';
import { cleanName } from './lib/catalog';

// The family is the household (#95, ADR 0004): members with the app (memberships) and family
// members without it (familyMembers), such as small children. Any member adds and renames one
// without the app; only the owner removes one. Each has a gift recipient, so they are in the
// fixed Familien group of the gift list, and calendars can be for them. An invite made for one
// of them claims the row when someone joins with it: they become that person, and the gifts
// and calendars planned for them are hidden from them from then on.

const MAX_NAME = 60;
/** More than any household; keeps a runaway client from filling the table. */
export const MAX_WITHOUT_APP = 20;

type Ctx = QueryCtx | MutationCtx;

function checkName(name: string) {
  const clean = cleanName(name).slice(0, MAX_NAME);
  if (clean === '') throw new ConvexError({ code: 'NAME_REQUIRED' });
  return clean;
}

/** The family members without the app (not yet joined), oldest first. */
export async function peopleWithoutApp(ctx: Ctx, groupId: Id<'groups'>) {
  const rows = await ctx.db
    .query('familyMembers')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return rows.filter((p) => p.userId === undefined).sort((a, b) => a.createdAt - b.createdAt);
}

/** Loads a family member without the app; one who has joined, or another family's, is NOT_FOUND. */
async function loadPerson(ctx: Ctx, familyMemberId: Id<'familyMembers'>) {
  const person = await ctx.db.get('familyMembers', familyMemberId);
  const access = await requireMemberOf(ctx, person);
  if (person!.userId !== undefined) throw new ConvexError({ code: 'NOT_FOUND' });
  return { person: person!, ...access };
}

/** Family members without the app, oldest first. */
export const people = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    await requireMembership(ctx, groupId);
    return (await peopleWithoutApp(ctx, groupId)).map((p) => ({
      _id: p._id,
      name: p.name,
      createdAt: p.createdAt,
    }));
  },
});

/** Adds a family member without the app, with their gift recipient. Any member may. */
export const addPerson = mutation({
  args: { groupId: v.id('groups'), name: v.string() },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId);
    const name = checkName(args.name);
    if ((await peopleWithoutApp(ctx, args.groupId)).length >= MAX_WITHOUT_APP) {
      throw new ConvexError({ code: 'TOO_MANY_PEOPLE' });
    }
    const now = Date.now();
    const familyMemberId = await ctx.db.insert('familyMembers', {
      groupId: args.groupId,
      name,
      createdAt: now,
    });
    await ctx.db.insert('giftRecipients', {
      groupId: args.groupId,
      name,
      familyMemberId,
      createdAt: now,
    });
    return familyMemberId;
  },
});

/** Renames a family member without the app, and their gift recipient with them. */
export const renamePerson = mutation({
  args: { familyMemberId: v.id('familyMembers'), name: v.string() },
  handler: async (ctx, args) => {
    const { person } = await loadPerson(ctx, args.familyMemberId);
    const name = checkName(args.name);
    if (name === person.name) return;
    await ctx.db.patch('familyMembers', person._id, { name });
    for (const recipient of await recipientsOf(ctx, person._id)) {
      await ctx.db.patch('giftRecipients', recipient._id, { name });
    }
  },
});

/**
 * Removes a family member without the app. Owner only, like members. Their gift recipient
 * stays as a plain person with their gifts and history; they are taken off calendars (a
 * calendar left with no one is deleted), and invites made for them stop working.
 */
export const removePerson = mutation({
  args: { familyMemberId: v.id('familyMembers') },
  handler: async (ctx, args) => {
    const person = await ctx.db.get('familyMembers', args.familyMemberId);
    await requireMemberOf(ctx, person);
    await requireOwner(ctx, person!.groupId);
    if (person!.userId !== undefined) throw new ConvexError({ code: 'NOT_FOUND' });
    await forgetPerson(ctx, person!);
  },
});

async function recipientsOf(ctx: Ctx, familyMemberId: Id<'familyMembers'>) {
  return await ctx.db
    .query('giftRecipients')
    .withIndex('by_family_member', (q) => q.eq('familyMemberId', familyMemberId))
    .collect();
}

async function forgetPerson(ctx: MutationCtx, person: Doc<'familyMembers'>) {
  for (const recipient of await recipientsOf(ctx, person._id)) {
    await ctx.db.patch('giftRecipients', recipient._id, { familyMemberId: undefined });
  }
  await forgetAdventFamilyMember(ctx, person._id);
  const invites = await ctx.db
    .query('invites')
    .withIndex('by_group', (q) => q.eq('groupId', person.groupId))
    .collect();
  for (const invite of invites) {
    if (invite.familyMemberId === person._id) await ctx.db.delete('invites', invite._id);
  }
  await ctx.db.delete('familyMembers', person._id);
}

/**
 * Someone joined with the invite made for `person`: from now on they are them. Their gift
 * recipient is linked to the account and their calendars carry it, so both are hidden from
 * them (ADR 0002, 0003, 0004).
 */
export async function claimPerson(
  ctx: MutationCtx,
  person: Doc<'familyMembers'>,
  userId: Id<'users'>,
) {
  await ctx.db.patch('familyMembers', person._id, { userId });
  const gifts = await ctx.db
    .query('gifts')
    .withIndex('by_group_occasion', (q) => q.eq('groupId', person.groupId))
    .collect();
  for (const recipient of await recipientsOf(ctx, person._id)) {
    await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: userId });
    // A gift can't be bought by someone it is for (they may have been a member before).
    for (const gift of gifts) {
      const forThem =
        gift.recipientId === recipient._id || (gift.alsoForIds ?? []).includes(recipient._id);
      if (forThem && gift.buyerUserId === userId) {
        await ctx.db.patch('gifts', gift._id, { buyerUserId: undefined });
      }
    }
  }
  await claimAdventRecipient(ctx, person._id, userId);
}

/**
 * Gives a member a gift recipient linked to them, if they have none in the family, so they are
 * in the Familien group. Says nothing back: the caller may be that member.
 */
export async function ensureMemberRecipient(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
) {
  const linked = await ctx.db
    .query('giftRecipients')
    .withIndex('by_group_member', (q) => q.eq('groupId', groupId).eq('memberUserId', userId))
    .first();
  if (linked !== null) return;
  const name = (await ctx.db.get('users', userId))?.name?.trim() || '?';
  await ctx.db.insert('giftRecipients', {
    groupId,
    name: name.slice(0, MAX_NAME),
    memberUserId: userId,
    createdAt: Date.now(),
  });
}

/**
 * Makes a plain gift recipient (such as a child added by name before #95) a family member
 * without the app. Called from gifts.ts after the recipient is loaded and checked.
 */
export async function personFromRecipient(ctx: MutationCtx, recipient: Doc<'giftRecipients'>) {
  if ((await peopleWithoutApp(ctx, recipient.groupId)).length >= MAX_WITHOUT_APP) {
    throw new ConvexError({ code: 'TOO_MANY_PEOPLE' });
  }
  const familyMemberId = await ctx.db.insert('familyMembers', {
    groupId: recipient.groupId,
    name: recipient.name,
    createdAt: Date.now(),
  });
  await ctx.db.patch('giftRecipients', recipient._id, {
    familyMemberId,
    // Familien is their group now.
    giftGroupId: undefined,
  });
  return familyMemberId;
}

/** Deletes the family members of a family that is being deleted (after its gifts and calendars). */
export async function deleteFamilyPeople(ctx: MutationCtx, groupId: Id<'groups'>) {
  const rows = await ctx.db
    .query('familyMembers')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  for (const row of rows) await ctx.db.delete('familyMembers', row._id);
}

/**
 * A deleted account is no longer the family member it joined as, in any family. The gift
 * recipient stays as a plain person (it is already unlinked by forgetGiftLinks).
 */
export async function forgetFamilyAccount(ctx: MutationCtx, userId: Id<'users'>) {
  const rows = await ctx.db
    .query('familyMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const row of rows) {
    for (const recipient of await recipientsOf(ctx, row._id)) {
      await ctx.db.patch('giftRecipients', recipient._id, { familyMemberId: undefined });
    }
    const calendarRows = await ctx.db
      .query('adventRecipients')
      .withIndex('by_family_member', (q) => q.eq('familyMemberId', row._id))
      .collect();
    for (const calendarRow of calendarRows) {
      await ctx.db.patch('adventRecipients', calendarRow._id, { familyMemberId: undefined });
    }
    await ctx.db.delete('familyMembers', row._id);
  }
}

/**
 * One-off for #95: every member of every family gets a gift recipient linked to them, so the
 * Familien group has everyone. Run once after deploying: `convex run family:backfillRecipients`.
 */
export const backfillRecipients = internalMutation({
  args: {},
  handler: async (ctx) => {
    let made = 0;
    for (const membership of await ctx.db.query('memberships').collect()) {
      const before = await ctx.db
        .query('giftRecipients')
        .withIndex('by_group_member', (q) =>
          q.eq('groupId', membership.groupId).eq('memberUserId', membership.userId),
        )
        .first();
      if (before !== null) continue;
      await ensureMemberRecipient(ctx, membership.groupId, membership.userId);
      made += 1;
    }
    return { made };
  },
});
