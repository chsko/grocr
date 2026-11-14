import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { giftStatus } from './schema';
import { accessError, getMembership, requireMemberOf, requireMembership } from './lib/access';
import { cleanName } from './lib/catalog';
import { christmasYear, GIFT_STATUSES, MAX_GIFT_YEAR, MIN_GIFT_YEAR } from './lib/gifts';
import { todayIn } from './lib/week';

// Christmas gifts (#78). The whole family plans together, but a gift recipient linked to a
// member is hidden from that member, with their gifts, ideas, budgets, history and their share
// of every total (ADR 0002). Everything here reaches recipients and gifts through
// `loadRecipient` or `visibleRecipients`, which leave the caller's own recipient out. A hidden
// recipient fails exactly like one that does not exist (NOT_FOUND), and no answer may depend on
// whether one exists: the caller is never offered as a link, so "already linked" can't give it
// away.

const KIND = 'christmas' as const;
const MAX_NAME = 60;
const MAX_TITLE = 120;

type Ctx = QueryCtx | MutationCtx;

/** Loads a recipient the caller may see; their own (or another family's) is NOT_FOUND. */
async function loadRecipient(ctx: Ctx, recipientId: Id<'giftRecipients'>) {
  const recipient = await ctx.db.get('giftRecipients', recipientId);
  const access = await requireMemberOf(ctx, recipient);
  if (recipient!.memberUserId === access.userId) throw accessError('NOT_FOUND');
  return { recipient: recipient!, ...access };
}

/** Loads a gift whose recipient the caller may see. */
async function loadGift(ctx: Ctx, giftId: Id<'gifts'>) {
  const gift = await ctx.db.get('gifts', giftId);
  if (gift === null) throw accessError('NOT_FOUND');
  const access = await loadRecipient(ctx, gift.recipientId);
  return { gift, ...access };
}

/** The family's recipients the caller may see, by name. */
async function visibleRecipients(ctx: Ctx, groupId: Id<'groups'>, userId: Id<'users'>) {
  const all = await ctx.db
    .query('giftRecipients')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return all.filter((r) => r.memberUserId !== userId).sort((a, b) => a.name.localeCompare(b.name));
}

async function currentYear(ctx: Ctx, groupId: Id<'groups'>) {
  const group = (await ctx.db.get('groups', groupId))!;
  return christmasYear(todayIn(group.timezone));
}

function checkYear(year: number) {
  if (!Number.isInteger(year) || year < MIN_GIFT_YEAR || year > MAX_GIFT_YEAR) {
    throw new ConvexError({ code: 'INVALID_YEAR' });
  }
}

function checkName(name: string) {
  const clean = cleanName(name).slice(0, MAX_NAME);
  if (clean === '') throw new ConvexError({ code: 'NAME_REQUIRED' });
  return clean;
}

function checkTitle(title: string) {
  const clean = cleanName(title).slice(0, MAX_TITLE);
  if (clean === '') throw new ConvexError({ code: 'GIFT_TITLE_REQUIRED' });
  return clean;
}

async function userName(ctx: Ctx, userId: Id<'users'> | undefined) {
  if (userId === undefined) return null;
  return (await ctx.db.get('users', userId))?.name ?? null;
}

async function giftsFor(ctx: Ctx, recipientId: Id<'giftRecipients'>, year: number) {
  const gifts = await ctx.db
    .query('gifts')
    .withIndex('by_recipient_occasion', (q) =>
      q.eq('recipientId', recipientId).eq('occasionKind', KIND).eq('occasionYear', year),
    )
    .collect();
  return gifts.sort((a, b) => a.createdAt - b.createdAt);
}

function tally(gifts: Doc<'gifts'>[]) {
  const counts = { idea: 0, bought: 0, wrapped: 0 };
  for (const gift of gifts) counts[gift.status] += 1;
  return counts;
}

function giftRow(gift: Doc<'gifts'>) {
  return { _id: gift._id, title: gift.title, status: gift.status };
}

/**
 * One Christmas as the one gift list: the recipients the caller may see, each with their gifts
 * in the order they were added and counted by status, and totals over just those recipients.
 */
export const christmas = query({
  args: { groupId: v.id('groups'), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId } = await requireMembership(ctx, args.groupId);
    const thisYear = await currentYear(ctx, args.groupId);
    const year = args.year ?? thisYear;
    checkYear(year);
    const recipients = [];
    const totals = { idea: 0, bought: 0, wrapped: 0 };
    for (const recipient of await visibleRecipients(ctx, args.groupId, userId)) {
      if (recipient.archivedAt !== undefined) continue;
      const gifts = await giftsFor(ctx, recipient._id, year);
      const counts = tally(gifts);
      for (const key of GIFT_STATUSES) totals[key] += counts[key];
      recipients.push({
        _id: recipient._id,
        name: recipient.name,
        linkedName: await userName(ctx, recipient.memberUserId),
        counts,
        gifts: gifts.map(giftRow),
      });
    }
    return { year, currentYear: thisYear, recipients, totals };
  },
});

/**
 * Recipients for the recipients screen, and the other members with whether a recipient is
 * linked to them, so the app can suggest links. The caller is left out of `members`: whether
 * someone has linked a recipient to them is exactly what they must not see.
 */
export const recipients = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const visible = await visibleRecipients(ctx, groupId, userId);
    const rows = await Promise.all(
      visible.map(async (r) => ({
        _id: r._id,
        name: r.name,
        linkedUserId: r.memberUserId ?? null,
        linkedName: await userName(ctx, r.memberUserId),
      })),
    );
    const linked = new Set(visible.map((r) => r.memberUserId).filter((id) => id !== undefined));
    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    memberships.sort((a, b) => a.joinedAt - b.joinedAt);
    const members = await Promise.all(
      memberships
        .filter((m) => m.userId !== userId)
        .map(async (m) => ({
          userId: m.userId,
          name: (await userName(ctx, m.userId)) ?? '',
          linked: linked.has(m.userId),
        })),
    );
    return { recipients: rows, members };
  },
});

/** Checks a member can be linked: not the caller, in the family, not linked elsewhere. */
async function checkLink(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  callerId: Id<'users'>,
  userId: Id<'users'>,
  except?: Id<'giftRecipients'>,
) {
  // Linking yourself would hide the recipient from you, and "already linked" would tell you
  // someone else made one for you. So it is refused before anything is looked up.
  if (userId === callerId) throw new ConvexError({ code: 'CANNOT_LINK_SELF' });
  if ((await getMembership(ctx, groupId, userId)) === null) throw accessError('NOT_FOUND');
  const existing = await ctx.db
    .query('giftRecipients')
    .withIndex('by_group_member', (q) => q.eq('groupId', groupId).eq('memberUserId', userId))
    .first();
  if (existing !== null && existing._id !== except) {
    throw new ConvexError({ code: 'ALREADY_LINKED' });
  }
}

/** Adds a gift recipient, optionally linked to a member (who then never sees them). */
export const addRecipient = mutation({
  args: { groupId: v.id('groups'), name: v.string(), memberUserId: v.optional(v.id('users')) },
  handler: async (ctx, args) => {
    const { userId } = await requireMembership(ctx, args.groupId);
    const name = checkName(args.name);
    if (args.memberUserId) await checkLink(ctx, args.groupId, userId, args.memberUserId);
    return await ctx.db.insert('giftRecipients', {
      groupId: args.groupId,
      name,
      memberUserId: args.memberUserId,
      createdAt: Date.now(),
    });
  },
});

/** Links a recipient to a member, or unlinks it with null. Sets absolute state. */
export const linkRecipient = mutation({
  args: { recipientId: v.id('giftRecipients'), memberUserId: v.union(v.id('users'), v.null()) },
  handler: async (ctx, args) => {
    const { recipient, userId } = await loadRecipient(ctx, args.recipientId);
    if (args.memberUserId === null) {
      if (recipient.memberUserId !== undefined) {
        await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: undefined });
      }
      return;
    }
    if (recipient.memberUserId === args.memberUserId) return;
    await checkLink(ctx, recipient.groupId, userId, args.memberUserId, recipient._id);
    await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: args.memberUserId });
  },
});

/** Adds a gift to a recipient's Christmas of `year`. */
export const addGift = mutation({
  args: { recipientId: v.id('giftRecipients'), title: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    checkYear(args.year);
    return await ctx.db.insert('gifts', {
      groupId: recipient.groupId,
      recipientId: recipient._id,
      occasionKind: KIND,
      occasionYear: args.year,
      title: checkTitle(args.title),
      status: 'idea',
      createdAt: Date.now(),
    });
  },
});

/** Sets a gift's status (Idea, Bought, Wrapped). Sets absolute state. */
export const setGiftStatus = mutation({
  args: { giftId: v.id('gifts'), status: giftStatus },
  handler: async (ctx, args) => {
    const { gift } = await loadGift(ctx, args.giftId);
    if (gift.status === args.status) return;
    await ctx.db.patch('gifts', gift._id, { status: args.status });
  },
});
