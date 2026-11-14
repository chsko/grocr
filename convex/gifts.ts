import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { giftStatus } from './schema';
import {
  accessError,
  getMembership,
  requireMemberOf,
  requireMembership,
  requireUserId,
} from './lib/access';
import { cleanName } from './lib/catalog';
import {
  christmasYear,
  cleanPrice,
  DEFAULT_GIFT_CARD_START,
  giftCardShowing,
  GIFT_STATUSES,
  isGiftCardStart,
  isSpent,
  MAX_GIFT_YEAR,
  MIN_GIFT_YEAR,
} from './lib/gifts';
import { normalizeRecipeUrl } from './lib/recipeLink';
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
const MAX_NOTE = 500;

type Ctx = QueryCtx | MutationCtx;

/** Loads a recipient the caller may see; their own (or another family's) is NOT_FOUND. */
async function loadRecipient(ctx: Ctx, recipientId: Id<'giftRecipients'>) {
  const recipient = await ctx.db.get('giftRecipients', recipientId);
  const access = await requireMemberOf(ctx, recipient);
  if (recipient!.memberUserId === access.userId) throw accessError('NOT_FOUND');
  return { recipient: recipient!, ...access };
}

/** For queries: a gift deleted (or newly hidden) on another phone is just gone. */
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ConvexError && (error.data as { code?: string }).code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

/** Loads a gift whose recipient the caller may see. */
async function loadGift(ctx: Ctx, giftId: Id<'gifts'>) {
  // Signed out first, so a signed-out caller can't tell a real gift from a missing one.
  await requireUserId(ctx);
  const gift = await ctx.db.get('gifts', giftId);
  if (gift === null) throw accessError('NOT_FOUND');
  const access = await loadRecipient(ctx, gift.recipientId);
  if (gift.groupId !== access.recipient.groupId) throw accessError('NOT_FOUND');
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

function checkPrice(price: number | null) {
  if (price === null) return undefined;
  const clean = cleanPrice(price);
  if (clean === null) throw new ConvexError({ code: 'INVALID_PRICE' });
  return clean;
}

function checkUrl(url: string) {
  const clean = normalizeRecipeUrl(url);
  if (clean === null) throw new ConvexError({ code: 'INVALID_LINK' });
  return clean === '' ? undefined : clean;
}

function checkNote(note: string) {
  const clean = note.trim().slice(0, MAX_NOTE);
  return clean === '' ? undefined : clean;
}

/** A buyer must be a current member and can't be the one the gift is for. */
async function checkBuyer(
  ctx: Ctx,
  recipient: Doc<'giftRecipients'>,
  buyerUserId: Id<'users'> | null,
) {
  if (buyerUserId === null) return undefined;
  const membership = await getMembership(ctx, recipient.groupId, buyerUserId);
  if (membership === null || buyerUserId === recipient.memberUserId) {
    throw new ConvexError({ code: 'INVALID_BUYER' });
  }
  return buyerUserId;
}

/** The family's members, oldest first, with their names. */
async function familyMembers(ctx: Ctx, groupId: Id<'groups'>) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  memberships.sort((a, b) => a.joinedAt - b.joinedAt);
  return await Promise.all(
    memberships.map(async (m) => ({
      userId: m.userId,
      name: (await userName(ctx, m.userId)) ?? '',
    })),
  );
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

/** A recipient's idea bank: gifts not yet in any Christmas, oldest first. */
async function bankFor(ctx: Ctx, recipientId: Id<'giftRecipients'>) {
  const ideas = await ctx.db
    .query('gifts')
    .withIndex('by_recipient_occasion', (q) =>
      q.eq('recipientId', recipientId).eq('occasionKind', undefined),
    )
    .collect();
  return ideas.sort((a, b) => a.createdAt - b.createdAt);
}

/** The family's gift groups, by name. */
async function familyGiftGroups(ctx: Ctx, groupId: Id<'groups'>) {
  const groups = await ctx.db
    .query('giftGroups')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadGiftGroup(ctx: Ctx, giftGroupId: Id<'giftGroups'>) {
  const giftGroup = await ctx.db.get('giftGroups', giftGroupId);
  const access = await requireMemberOf(ctx, giftGroup);
  return { giftGroup: giftGroup!, ...access };
}

async function budgetFor(ctx: Ctx, recipientId: Id<'giftRecipients'>, year: number) {
  return await ctx.db
    .query('giftBudgets')
    .withIndex('by_recipient_occasion', (q) =>
      q.eq('recipientId', recipientId).eq('occasionKind', KIND).eq('occasionYear', year),
    )
    .unique();
}

/** Counts by status; spent is what Bought and Wrapped gifts cost, planned what ideas would. */
function tally(gifts: Doc<'gifts'>[]) {
  const counts = { idea: 0, bought: 0, wrapped: 0 };
  let spent = 0;
  let planned = 0;
  for (const gift of gifts) {
    counts[gift.status] += 1;
    if (isSpent(gift.status)) spent += gift.price ?? 0;
    else planned += gift.price ?? 0;
  }
  return { counts, spent: round(spent), planned: round(planned) };
}

function round(amount: number) {
  return Math.round(amount * 100) / 100;
}

async function giftRow(ctx: Ctx, gift: Doc<'gifts'>) {
  return {
    _id: gift._id,
    title: gift.title,
    status: gift.status,
    price: gift.price ?? null,
    url: gift.url ?? null,
    note: gift.note ?? null,
    buyerUserId: gift.buyerUserId ?? null,
    buyerName: await userName(ctx, gift.buyerUserId),
  };
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
    let budget: number | null = null;
    let spent = 0;
    let planned = 0;
    // Recipients with nothing in this Christmas, so the app can add a gift to an earlier one.
    const others = [];
    for (const recipient of await visibleRecipients(ctx, args.groupId, userId)) {
      const gifts = await giftsFor(ctx, recipient._id, year);
      const own = (await budgetFor(ctx, recipient._id, year))?.amount ?? null;
      // Active recipients are always in this Christmas and later ones. Earlier Christmases, and
      // archived recipients, list only who has gifts or a budget there.
      const always = recipient.archivedAt === undefined && year >= thisYear;
      if (!always && gifts.length === 0 && own === null) {
        if (recipient.archivedAt === undefined) {
          others.push({ _id: recipient._id, name: recipient.name });
        }
        continue;
      }
      const sums = tally(gifts);
      for (const key of GIFT_STATUSES) totals[key] += sums.counts[key];
      if (own !== null) budget = (budget ?? 0) + own;
      spent += sums.spent;
      planned += sums.planned;
      recipients.push({
        _id: recipient._id,
        name: recipient.name,
        giftGroupId: recipient.giftGroupId ?? null,
        linkedName: await userName(ctx, recipient.memberUserId),
        ...sums,
        budget: own,
        lastBudget: (await budgetFor(ctx, recipient._id, year - 1))?.amount ?? null,
        bankCount: (await bankFor(ctx, recipient._id)).length,
        gifts: await Promise.all(gifts.map((g) => giftRow(ctx, g))),
      });
    }
    const money = {
      budget: budget === null ? null : round(budget),
      spent: round(spent),
      planned: round(planned),
    };
    // Gift groups with someone in this list, done when each of them has a bought or wrapped
    // gift. Only people the caller may see count, so the mark gives nothing away.
    const groups = [];
    for (const giftGroup of await familyGiftGroups(ctx, args.groupId)) {
      const members = recipients.filter((r) => r.giftGroupId === giftGroup._id);
      if (members.length === 0) continue;
      groups.push({
        _id: giftGroup._id,
        name: giftGroup.name,
        done: members.every((r) => r.counts.bought + r.counts.wrapped > 0),
      });
    }
    return {
      year,
      currentYear: thisYear,
      groups,
      recipients,
      others,
      totals: { ...totals, ...money },
    };
  },
});

/**
 * The Christmas gifts card on Week: null outside the family's window (start day to Christmas
 * Eve) or with no active recipients the caller may see. Counts and money leave out the
 * caller's own recipient, like everything else.
 */
export const weekCard = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const group = (await ctx.db.get('groups', groupId))!;
    const today = todayIn(group.timezone);
    if (!giftCardShowing(today, group.giftCardStart ?? DEFAULT_GIFT_CARD_START)) return null;
    const year = christmasYear(today);
    const recipients = (await visibleRecipients(ctx, groupId, userId)).filter(
      (r) => r.archivedAt === undefined,
    );
    if (recipients.length === 0) return null;
    let done = 0;
    let total = 0;
    let spent = 0;
    let budget: number | null = null;
    for (const recipient of recipients) {
      const sums = tally(await giftsFor(ctx, recipient._id, year));
      done += sums.counts.bought + sums.counts.wrapped;
      total += sums.counts.idea + sums.counts.bought + sums.counts.wrapped;
      spent += sums.spent;
      const own = (await budgetFor(ctx, recipient._id, year))?.amount;
      if (own !== undefined) budget = (budget ?? 0) + own;
    }
    return {
      year,
      done,
      total,
      spent: round(spent),
      budget: budget === null ? null : round(budget),
    };
  },
});

/** The idea bank: ideas for every recipient the caller may see, waiting for a Christmas. */
export const ideas = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }) => {
    const { userId } = await requireMembership(ctx, groupId);
    const recipients = [];
    for (const recipient of await visibleRecipients(ctx, groupId, userId)) {
      if (recipient.archivedAt !== undefined) continue;
      const bank = await bankFor(ctx, recipient._id);
      recipients.push({
        _id: recipient._id,
        name: recipient.name,
        ideas: await Promise.all(bank.map((g) => giftRow(ctx, g))),
      });
    }
    return { currentYear: await currentYear(ctx, groupId), recipients };
  },
});

/**
 * One gift, for its edit sheet, with who can be picked as buyer: every member but the one the
 * gift is for. Null when the gift is gone or hidden from the caller, which look the same.
 */
export const gift = query({
  args: { giftId: v.id('gifts') },
  handler: async (ctx, { giftId }) => {
    const access = await orNull(() => loadGift(ctx, giftId));
    if (access === null) return null;
    const { gift, recipient } = access;
    const members = await familyMembers(ctx, recipient.groupId);
    return {
      ...(await giftRow(ctx, gift)),
      year: gift.occasionYear ?? null,
      recipientId: recipient._id,
      recipientName: recipient.name,
      buyers: members.filter((m) => m.userId !== recipient.memberUserId),
    };
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
        archived: r.archivedAt !== undefined,
        giftGroupId: r.giftGroupId ?? null,
      })),
    );
    const linked = new Set(visible.map((r) => r.memberUserId).filter((id) => id !== undefined));
    const members = (await familyMembers(ctx, groupId))
      .filter((m) => m.userId !== userId)
      .map((m) => {
        const isLinked = linked.has(m.userId);
        // An unlinked recipient with the member's name is likely them: offer to link it.
        // Full name or first name, either way round ("Emma" for "Emma Hansen").
        const full = m.name.trim().toLocaleLowerCase();
        const first = full.split(/\s+/)[0];
        const same = visible.find(
          (r) =>
            r.memberUserId === undefined &&
            [full, first].includes(r.name.trim().toLocaleLowerCase()),
        );
        return { ...m, linked: isLinked, match: !isLinked && same ? same._id : null };
      });
    const group = (await ctx.db.get('groups', groupId))!;
    const groups = (await familyGiftGroups(ctx, groupId)).map((g) => ({
      _id: g._id,
      name: g.name,
    }));
    return {
      recipients: rows,
      groups,
      members,
      cardStart: group.giftCardStart ?? DEFAULT_GIFT_CARD_START,
    };
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
    // A gift can't be bought by the person it is for.
    const gifts = await ctx.db
      .query('gifts')
      .withIndex('by_recipient_occasion', (q) => q.eq('recipientId', recipient._id))
      .collect();
    for (const gift of gifts) {
      if (gift.buyerUserId === args.memberUserId) {
        await ctx.db.patch('gifts', gift._id, { buyerUserId: undefined });
      }
    }
  },
});

/** Adds a gift to a recipient's Christmas of `year`, or to their idea bank without one. */
export const addGift = mutation({
  args: { recipientId: v.id('giftRecipients'), title: v.string(), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    if (args.year !== undefined) checkYear(args.year);
    return await ctx.db.insert('gifts', {
      groupId: recipient.groupId,
      recipientId: recipient._id,
      occasionKind: args.year === undefined ? undefined : KIND,
      occasionYear: args.year,
      title: checkTitle(args.title),
      status: 'idea',
      createdAt: Date.now(),
    });
  },
});

/**
 * Sets a gift's status (Idea, Bought, Wrapped). An idea in the bank that is bought or wrapped
 * has become a gift for this Christmas, so it moves there. Sets absolute state.
 */
export const setGiftStatus = mutation({
  args: { giftId: v.id('gifts'), status: giftStatus },
  handler: async (ctx, args) => {
    const { gift, recipient } = await loadGift(ctx, args.giftId);
    if (gift.status === args.status) return;
    if (gift.occasionKind === undefined) {
      await ctx.db.patch('gifts', gift._id, {
        status: args.status,
        occasionKind: KIND,
        occasionYear: await currentYear(ctx, recipient.groupId),
      });
      return;
    }
    await ctx.db.patch('gifts', gift._id, { status: args.status });
  },
});

/** Moves a gift into a Christmas, or back to the idea bank (as an Idea again) with null. */
export const moveGift = mutation({
  args: { giftId: v.id('gifts'), year: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const { gift } = await loadGift(ctx, args.giftId);
    if (args.year === null) {
      if (gift.occasionKind === undefined) return;
      await ctx.db.patch('gifts', gift._id, {
        occasionKind: undefined,
        occasionYear: undefined,
        status: 'idea',
      });
      return;
    }
    checkYear(args.year);
    if (gift.occasionYear === args.year) return;
    await ctx.db.patch('gifts', gift._id, { occasionKind: KIND, occasionYear: args.year });
  },
});

/** Sets a gift's details from its edit sheet. Empty values clear a field. */
export const updateGift = mutation({
  args: {
    giftId: v.id('gifts'),
    title: v.string(),
    price: v.union(v.number(), v.null()),
    url: v.string(),
    note: v.string(),
    buyerUserId: v.union(v.id('users'), v.null()),
  },
  handler: async (ctx, args) => {
    const { gift, recipient } = await loadGift(ctx, args.giftId);
    await ctx.db.patch('gifts', gift._id, {
      title: checkTitle(args.title),
      price: checkPrice(args.price),
      url: checkUrl(args.url),
      note: checkNote(args.note),
      buyerUserId: await checkBuyer(ctx, recipient, args.buyerUserId),
    });
  },
});

export const removeGift = mutation({
  args: { giftId: v.id('gifts') },
  handler: async (ctx, { giftId }) => {
    const { gift } = await loadGift(ctx, giftId);
    await ctx.db.delete('gifts', gift._id);
  },
});

/** Sets a recipient's budget for one Christmas, or clears it with null. */
export const setBudget = mutation({
  args: {
    recipientId: v.id('giftRecipients'),
    year: v.number(),
    amount: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    checkYear(args.year);
    const amount = checkPrice(args.amount);
    const existing = await budgetFor(ctx, recipient._id, args.year);
    if (amount === undefined) {
      if (existing) await ctx.db.delete('giftBudgets', existing._id);
    } else if (existing) {
      if (existing.amount !== amount) await ctx.db.patch('giftBudgets', existing._id, { amount });
    } else {
      await ctx.db.insert('giftBudgets', {
        groupId: recipient.groupId,
        recipientId: recipient._id,
        occasionKind: KIND,
        occasionYear: args.year,
        amount,
      });
    }
  },
});

export const renameRecipient = mutation({
  args: { recipientId: v.id('giftRecipients'), name: v.string() },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    const name = checkName(args.name);
    if (name !== recipient.name) await ctx.db.patch('giftRecipients', recipient._id, { name });
  },
});

/** Archives a recipient (they leave new Christmases but keep their history) or brings them back. */
export const setRecipientArchived = mutation({
  args: { recipientId: v.id('giftRecipients'), archived: v.boolean() },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    if ((recipient.archivedAt !== undefined) === args.archived) return;
    await ctx.db.patch('giftRecipients', recipient._id, {
      archivedAt: args.archived ? Date.now() : undefined,
    });
  },
});

/** Deletes a recipient with all their gifts, ideas and budgets. */
export const removeRecipient = mutation({
  args: { recipientId: v.id('giftRecipients') },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    await deleteRecipient(ctx, recipient._id);
  },
});

async function deleteRecipient(ctx: MutationCtx, recipientId: Id<'giftRecipients'>) {
  const gifts = await ctx.db
    .query('gifts')
    .withIndex('by_recipient_occasion', (q) => q.eq('recipientId', recipientId))
    .collect();
  for (const gift of gifts) await ctx.db.delete('gifts', gift._id);
  const budgets = await ctx.db
    .query('giftBudgets')
    .withIndex('by_recipient_occasion', (q) => q.eq('recipientId', recipientId))
    .collect();
  for (const budget of budgets) await ctx.db.delete('giftBudgets', budget._id);
  await ctx.db.delete('giftRecipients', recipientId);
}

// Clean-up, shared with groups.ts and account.ts.

/** Deletes every gift recipient, gift and budget of a family that is being deleted. */
export async function deleteFamilyGifts(ctx: MutationCtx, groupId: Id<'groups'>) {
  const recipients = await ctx.db
    .query('giftRecipients')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  for (const recipient of recipients) await deleteRecipient(ctx, recipient._id);
  for (const giftGroup of await familyGiftGroups(ctx, groupId)) {
    await ctx.db.delete('giftGroups', giftGroup._id);
  }
}

/**
 * A deleted account leaves no name behind: gifts they were buying lose the buyer, and a
 * recipient linked to them is unlinked (there is no one left to hide it from).
 */
export async function forgetGiftMember(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
) {
  const linked = await ctx.db
    .query('giftRecipients')
    .withIndex('by_group_member', (q) => q.eq('groupId', groupId).eq('memberUserId', userId))
    .collect();
  for (const recipient of linked) {
    await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: undefined });
  }
  const gifts = await ctx.db
    .query('gifts')
    .withIndex('by_group_occasion', (q) => q.eq('groupId', groupId))
    .collect();
  for (const gift of gifts) {
    if (gift.buyerUserId === userId) {
      await ctx.db.patch('gifts', gift._id, { buyerUserId: undefined });
    }
  }
}

/** From which day ("MM-DD", up to 24 December) the gifts card shows on Week. */
export const setCardStart = mutation({
  args: { groupId: v.id('groups'), start: v.string() },
  handler: async (ctx, { groupId, start }) => {
    await requireMembership(ctx, groupId);
    if (!isGiftCardStart(start)) throw new ConvexError({ code: 'INVALID_DATE' });
    await ctx.db.patch('groups', groupId, {
      giftCardStart: start === DEFAULT_GIFT_CARD_START ? undefined : start,
    });
  },
});

/** A deleted account is unlinked everywhere, also in families it left before (ADR 0002). */
export async function forgetGiftLinks(ctx: MutationCtx, userId: Id<'users'>) {
  const linked = await ctx.db
    .query('giftRecipients')
    .withIndex('by_member', (q) => q.eq('memberUserId', userId))
    .collect();
  for (const recipient of linked) {
    await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: undefined });
  }
}

/** Adds a named gift group ("In-laws", "Kids"). */
export const addGiftGroup = mutation({
  args: { groupId: v.id('groups'), name: v.string() },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.groupId);
    return await ctx.db.insert('giftGroups', {
      groupId: args.groupId,
      name: checkName(args.name),
      createdAt: Date.now(),
    });
  },
});

export const renameGiftGroup = mutation({
  args: { giftGroupId: v.id('giftGroups'), name: v.string() },
  handler: async (ctx, args) => {
    const { giftGroup } = await loadGiftGroup(ctx, args.giftGroupId);
    const name = checkName(args.name);
    if (name !== giftGroup.name) await ctx.db.patch('giftGroups', giftGroup._id, { name });
  },
});

/** Deletes a gift group; its people stay, without a group. */
export const removeGiftGroup = mutation({
  args: { giftGroupId: v.id('giftGroups') },
  handler: async (ctx, args) => {
    const { giftGroup } = await loadGiftGroup(ctx, args.giftGroupId);
    // Every recipient, also ones hidden from the caller, so none points at a deleted group.
    const recipients = await ctx.db
      .query('giftRecipients')
      .withIndex('by_group', (q) => q.eq('groupId', giftGroup.groupId))
      .collect();
    for (const recipient of recipients) {
      if (recipient.giftGroupId === giftGroup._id) {
        await ctx.db.patch('giftRecipients', recipient._id, { giftGroupId: undefined });
      }
    }
    await ctx.db.delete('giftGroups', giftGroup._id);
  },
});

/** Puts a person in one gift group, or in none with null. Sets absolute state. */
export const setRecipientGroup = mutation({
  args: {
    recipientId: v.id('giftRecipients'),
    giftGroupId: v.union(v.id('giftGroups'), v.null()),
  },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    if (args.giftGroupId !== null) {
      const giftGroup = await ctx.db.get('giftGroups', args.giftGroupId);
      if (giftGroup === null || giftGroup.groupId !== recipient.groupId) {
        throw accessError('NOT_FOUND');
      }
    }
    const next = args.giftGroupId ?? undefined;
    if (recipient.giftGroupId === next) return;
    await ctx.db.patch('giftRecipients', recipient._id, { giftGroupId: next });
  },
});
