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
  MAX_JOINT,
  MIN_GIFT_YEAR,
} from './lib/gifts';
import { personFromRecipient } from './family';
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

/** Everyone a gift is for: its recipient first, then the others of a joint gift. */
function forIds(gift: Doc<'gifts'>): Id<'giftRecipients'>[] {
  return [gift.recipientId, ...(gift.alsoForIds ?? [])];
}

function isFor(gift: Doc<'gifts'>, recipientId: Id<'giftRecipients'>) {
  return gift.recipientId === recipientId || (gift.alsoForIds ?? []).includes(recipientId);
}

/**
 * Loads a gift the caller may see: every person it is for must be visible to them, so a joint
 * gift for the caller and someone else is hidden from the caller like any gift for them.
 */
async function loadGift(ctx: Ctx, giftId: Id<'gifts'>) {
  // Signed out first, so a signed-out caller can't tell a real gift from a missing one.
  await requireUserId(ctx);
  const gift = await ctx.db.get('gifts', giftId);
  if (gift === null) throw accessError('NOT_FOUND');
  const access = await loadRecipient(ctx, gift.recipientId);
  if (gift.groupId !== access.recipient.groupId) throw accessError('NOT_FOUND');
  const recipients = [access.recipient];
  for (const id of gift.alsoForIds ?? []) {
    const other = (await loadRecipient(ctx, id)).recipient;
    if (other.groupId !== gift.groupId) throw accessError('NOT_FOUND');
    recipients.push(other);
  }
  return { gift, recipients, ...access };
}

/**
 * The family's gifts in one Christmas (or the idea bank with null) that the caller may see:
 * every person each is for is among `visible`. Oldest first.
 */
async function occasionGifts(
  ctx: Ctx,
  groupId: Id<'groups'>,
  year: number | null,
  visible: Set<Id<'giftRecipients'>>,
) {
  const gifts = await ctx.db
    .query('gifts')
    .withIndex('by_group_occasion', (q) =>
      year === null
        ? q.eq('groupId', groupId).eq('occasionKind', undefined)
        : q.eq('groupId', groupId).eq('occasionKind', KIND).eq('occasionYear', year),
    )
    .collect();
  return gifts
    .filter((g) => forIds(g).every((id) => visible.has(id)))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Every gift and idea of a family, in any Christmas, also ones hidden from the caller. */
async function allFamilyGifts(ctx: Ctx, groupId: Id<'groups'>) {
  return await ctx.db
    .query('gifts')
    .withIndex('by_group_occasion', (q) => q.eq('groupId', groupId))
    .collect();
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

/** A buyer must be a current member and can't be one of those the gift is for. */
async function checkBuyer(
  ctx: Ctx,
  recipients: Doc<'giftRecipients'>[],
  buyerUserId: Id<'users'> | null,
) {
  if (buyerUserId === null) return undefined;
  const membership = await getMembership(ctx, recipients[0].groupId, buyerUserId);
  if (membership === null || recipients.some((r) => r.memberUserId === buyerUserId)) {
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

/**
 * Who is in the fixed Familien group (#95): recipients of current members, and of family
 * members without the app. A member who left, or a removed family member, is a plain person.
 */
async function familyCircle(ctx: Ctx, groupId: Id<'groups'>) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  const members = new Set(memberships.map((m) => m.userId));
  const people = await ctx.db
    .query('familyMembers')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  const withoutApp = new Set(people.filter((p) => p.userId === undefined).map((p) => p._id));
  return (recipient: Doc<'giftRecipients'>) => ({
    inFamily:
      (recipient.memberUserId !== undefined && members.has(recipient.memberUserId)) ||
      (recipient.familyMemberId !== undefined && withoutApp.has(recipient.familyMemberId)),
    withoutApp: recipient.familyMemberId !== undefined && withoutApp.has(recipient.familyMemberId),
  });
}

async function userName(ctx: Ctx, userId: Id<'users'> | undefined) {
  if (userId === undefined) return null;
  return (await ctx.db.get('users', userId))?.name ?? null;
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

/**
 * One person's share of a gift's price: all of it, or for a joint gift an even share in whole
 * øre, with what is left over going to its first recipient so the shares add up to the price.
 */
function priceShare(gift: Doc<'gifts'>, recipientId: Id<'giftRecipients'>) {
  const price = gift.price ?? 0;
  const ids = forIds(gift);
  if (ids.length === 1) return price;
  const each = Math.floor((price * 100) / ids.length) / 100;
  return ids[0] === recipientId ? round(price - each * (ids.length - 1)) : each;
}

/**
 * Counts by status; spent is what Bought and Wrapped gifts cost, planned what ideas would.
 * For one person (`forId`), a joint gift counts their share of the price.
 */
function tally(gifts: Doc<'gifts'>[], forId?: Id<'giftRecipients'>) {
  const counts = { idea: 0, bought: 0, wrapped: 0 };
  let spent = 0;
  let planned = 0;
  for (const gift of gifts) {
    counts[gift.status] += 1;
    const price = forId === undefined ? (gift.price ?? 0) : priceShare(gift, forId);
    if (isSpent(gift.status)) spent += price;
    else planned += price;
  }
  return { counts, spent: round(spent), planned: round(planned) };
}

function round(amount: number) {
  return Math.round(amount * 100) / 100;
}

async function giftRow(ctx: Ctx, gift: Doc<'gifts'>) {
  return {
    _id: gift._id,
    // Everyone it is for, so a joint gift can say who it is shared with.
    recipients: await Promise.all(
      forIds(gift).map(async (id) => ({
        _id: id,
        name: (await ctx.db.get('giftRecipients', id))?.name ?? '',
      })),
    ),
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
    const visible = await visibleRecipients(ctx, args.groupId, userId);
    const circle = await familyCircle(ctx, args.groupId);
    const visibleIds = new Set(visible.map((r) => r._id));
    const all = await occasionGifts(ctx, args.groupId, year, visibleIds);
    const bank = await occasionGifts(ctx, args.groupId, null, visibleIds);
    for (const recipient of visible) {
      const gifts = all.filter((g) => isFor(g, recipient._id));
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
      const sums = tally(gifts, recipient._id);
      if (own !== null) budget = (budget ?? 0) + own;
      recipients.push({
        _id: recipient._id,
        name: recipient.name,
        giftGroupId: recipient.giftGroupId ?? null,
        ...circle(recipient),
        linkedName: await userName(ctx, recipient.memberUserId),
        ...sums,
        budget: own,
        lastBudget: (await budgetFor(ctx, recipient._id, year - 1))?.amount ?? null,
        bankCount: bank.filter((g) => isFor(g, recipient._id)).length,
        gifts: await Promise.all(gifts.map((g) => giftRow(ctx, g))),
      });
    }
    // Totals count each gift once, joint or not.
    const whole = tally(all);
    for (const key of GIFT_STATUSES) totals[key] += whole.counts[key];
    spent += whole.spent;
    planned += whole.planned;
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
    const family = recipients.filter((r) => r.inFamily);
    return {
      year,
      currentYear: thisYear,
      // The fixed Familien group, first in the list; null when no one in it is shown.
      family:
        family.length === 0
          ? null
          : { done: family.every((r) => r.counts.bought + r.counts.wrapped > 0) },
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
    const seen = await visibleRecipients(ctx, groupId, userId);
    const recipients = seen.filter((r) => r.archivedAt === undefined);
    if (recipients.length === 0) return null;
    const visible = new Set(seen.map((r) => r._id));
    const active = new Set(recipients.map((r) => r._id));
    // Each gift once, when someone it is for is still active.
    const sums = tally(
      (await occasionGifts(ctx, groupId, year, visible)).filter((g) =>
        forIds(g).some((id) => active.has(id)),
      ),
    );
    let budget: number | null = null;
    for (const recipient of recipients) {
      const own = (await budgetFor(ctx, recipient._id, year))?.amount;
      if (own !== undefined) budget = (budget ?? 0) + own;
    }
    return {
      year,
      done: sums.counts.bought + sums.counts.wrapped,
      total: sums.counts.idea + sums.counts.bought + sums.counts.wrapped,
      spent: sums.spent,
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
    const visible = await visibleRecipients(ctx, groupId, userId);
    const bank = await occasionGifts(ctx, groupId, null, new Set(visible.map((r) => r._id)));
    for (const recipient of visible) {
      if (recipient.archivedAt !== undefined) continue;
      const ideas = bank.filter((g) => isFor(g, recipient._id));
      recipients.push({
        _id: recipient._id,
        name: recipient.name,
        ideas: await Promise.all(ideas.map((g) => giftRow(ctx, g))),
      });
    }
    return { currentYear: await currentYear(ctx, groupId), recipients };
  },
});

/**
 * One gift, for its edit sheet, with who can be picked as buyer (every member but those the
 * gift is for) and who else it could be for. Null when the gift is gone or hidden from the
 * caller, which look the same.
 */
export const gift = query({
  args: { giftId: v.id('gifts') },
  handler: async (ctx, { giftId }) => {
    const access = await orNull(() => loadGift(ctx, giftId));
    if (access === null) return null;
    const { gift, recipient, recipients, userId } = access;
    const members = await familyMembers(ctx, recipient.groupId);
    const chosen = new Set(recipients.map((r) => r._id));
    const choices = (await visibleRecipients(ctx, recipient.groupId, userId))
      .filter((r) => chosen.has(r._id) || r.archivedAt === undefined)
      .map((r) => ({ _id: r._id, name: r.name }));
    return {
      ...(await giftRow(ctx, gift)),
      year: gift.occasionYear ?? null,
      recipientId: recipient._id,
      recipientName: recipient.name,
      choices,
      buyers: members.filter((m) => !recipients.some((r) => r.memberUserId === m.userId)),
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
    const circle = await familyCircle(ctx, groupId);
    const rows = await Promise.all(
      visible.map(async (r) => ({
        _id: r._id,
        name: r.name,
        ...circle(r),
        // A plain person (no link, not family) can be moved into the family.
        canMoveToFamily: r.memberUserId === undefined && r.familyMemberId === undefined,
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
        // Also for a linked member: a plain look-alike may be them from before they joined.
        return {
          ...m,
          linked: isLinked,
          match: same && same.familyMemberId === undefined ? same._id : null,
        };
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

/** Checks a member can be linked: not the caller, and in the family. */
async function checkLink(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  callerId: Id<'users'>,
  userId: Id<'users'>,
) {
  // Linking yourself would hide the recipient from you, and an answer about it would tell you
  // someone else made one for you. So it is refused before anything is looked up.
  if (userId === callerId) throw new ConvexError({ code: 'CANNOT_LINK_SELF' });
  if ((await getMembership(ctx, groupId, userId)) === null) throw accessError('NOT_FOUND');
}

/**
 * A member is one gift recipient. Any other recipient linked to them (such as the one every
 * member gets for Familien, #95) is merged into `targetId`: its gifts, ideas and budgets move
 * over and it is deleted. Never refused, so nothing about gifts hidden from the caller shows.
 */
async function mergeLinked(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
  targetId: Id<'giftRecipients'>,
) {
  const others = (
    await ctx.db
      .query('giftRecipients')
      .withIndex('by_group_member', (q) => q.eq('groupId', groupId).eq('memberUserId', userId))
      .collect()
  ).filter((r) => r._id !== targetId);
  if (others.length === 0) return;
  const target = (await ctx.db.get('giftRecipients', targetId))!;
  // A member's one recipient is active, so they stay in Familien.
  if (target.archivedAt !== undefined) {
    await ctx.db.patch('giftRecipients', targetId, { archivedAt: undefined });
  }
  for (const other of others) {
    for (const gift of await allFamilyGifts(ctx, groupId)) {
      if (!isFor(gift, other._id)) continue;
      const ids = [...new Set(forIds(gift).map((id) => (id === other._id ? targetId : id)))];
      await ctx.db.patch('gifts', gift._id, {
        recipientId: ids[0],
        alsoForIds: ids.length > 1 ? ids.slice(1) : undefined,
      });
    }
    const budgets = await ctx.db
      .query('giftBudgets')
      .withIndex('by_recipient_occasion', (q) => q.eq('recipientId', other._id))
      .collect();
    for (const budget of budgets) {
      const theirs = await ctx.db
        .query('giftBudgets')
        .withIndex('by_recipient_occasion', (q) =>
          q
            .eq('recipientId', targetId)
            .eq('occasionKind', budget.occasionKind)
            .eq('occasionYear', budget.occasionYear),
        )
        .unique();
      if (theirs === null) {
        await ctx.db.patch('giftBudgets', budget._id, { recipientId: targetId });
      } else {
        await ctx.db.patch('giftBudgets', theirs._id, {
          amount: round(theirs.amount + budget.amount),
        });
        await ctx.db.delete('giftBudgets', budget._id);
      }
    }
    if (other.familyMemberId !== undefined && target.familyMemberId === undefined) {
      await ctx.db.patch('giftRecipients', targetId, { familyMemberId: other.familyMemberId });
    }
    await ctx.db.delete('giftRecipients', other._id);
  }
}

/** A gift can't be bought by someone it is for, joint gifts included. */
async function clearOwnBuyer(
  ctx: MutationCtx,
  recipient: Doc<'giftRecipients'>,
  userId: Id<'users'>,
) {
  for (const gift of await allFamilyGifts(ctx, recipient.groupId)) {
    if (isFor(gift, recipient._id) && gift.buyerUserId === userId) {
      await ctx.db.patch('gifts', gift._id, { buyerUserId: undefined });
    }
  }
}

/** Adds a gift recipient, optionally linked to a member (who then never sees them). */
export const addRecipient = mutation({
  args: {
    groupId: v.id('groups'),
    name: v.string(),
    memberUserId: v.optional(v.id('users')),
    /** Starts the person in this gift group. */
    giftGroupId: v.optional(v.id('giftGroups')),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireMembership(ctx, args.groupId);
    const name = checkName(args.name);
    if (args.memberUserId) await checkLink(ctx, args.groupId, userId, args.memberUserId);
    if (args.giftGroupId) {
      const giftGroup = await ctx.db.get('giftGroups', args.giftGroupId);
      if (giftGroup === null || giftGroup.groupId !== args.groupId) {
        throw accessError('NOT_FOUND');
      }
    }
    const recipientId = await ctx.db.insert('giftRecipients', {
      groupId: args.groupId,
      name,
      memberUserId: args.memberUserId,
      giftGroupId: args.giftGroupId,
      createdAt: Date.now(),
    });
    if (args.memberUserId) await mergeLinked(ctx, args.groupId, args.memberUserId, recipientId);
    return recipientId;
  },
});

/** Links a recipient to a member, or unlinks it with null. Sets absolute state. */
export const linkRecipient = mutation({
  args: { recipientId: v.id('giftRecipients'), memberUserId: v.union(v.id('users'), v.null()) },
  handler: async (ctx, args) => {
    const { recipient, userId } = await loadRecipient(ctx, args.recipientId);
    const circle = (await familyCircle(ctx, recipient.groupId))(recipient);
    // A family member without the app is linked by joining with their invite, nothing else.
    if (circle.withoutApp) throw new ConvexError({ code: 'IN_FAMILY' });
    if (args.memberUserId === null) {
      if (recipient.memberUserId !== undefined) {
        await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: undefined });
      }
      return;
    }
    if (recipient.memberUserId === args.memberUserId) return;
    // Moving a current member's recipient to someone else would leave them with none, and show
    // them their gifts; a wrong link is undone by unlinking first.
    if (circle.inFamily) throw new ConvexError({ code: 'IN_FAMILY' });
    await checkLink(ctx, recipient.groupId, userId, args.memberUserId);
    await ctx.db.patch('giftRecipients', recipient._id, { memberUserId: args.memberUserId });
    await mergeLinked(ctx, recipient.groupId, args.memberUserId, recipient._id);
    await clearOwnBuyer(ctx, recipient, args.memberUserId);
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
    const { gift, recipients } = await loadGift(ctx, args.giftId);
    await ctx.db.patch('gifts', gift._id, {
      title: checkTitle(args.title),
      price: checkPrice(args.price),
      url: checkUrl(args.url),
      note: checkNote(args.note),
      buyerUserId: await checkBuyer(ctx, recipients, args.buyerUserId),
    });
  },
});

/**
 * Who a gift is for: one person, or several for a joint gift. Every one must be someone the
 * caller may see in the gift's family. The gift stays under its first recipient while they are
 * still among them. A buyer who is now among those it is for stops being the buyer. Sets
 * absolute state.
 */
export const setGiftRecipients = mutation({
  args: { giftId: v.id('gifts'), recipientIds: v.array(v.id('giftRecipients')) },
  handler: async (ctx, args) => {
    const { gift } = await loadGift(ctx, args.giftId);
    const ids = [...new Set(args.recipientIds)];
    if (ids.length === 0 || ids.length > MAX_JOINT) {
      throw new ConvexError({ code: 'INVALID_RECIPIENTS' });
    }
    const recipients = [];
    for (const id of ids) {
      const { recipient } = await loadRecipient(ctx, id);
      if (recipient.groupId !== gift.groupId) throw accessError('NOT_FOUND');
      recipients.push(recipient);
    }
    const first = ids.includes(gift.recipientId) ? gift.recipientId : ids[0];
    const others = ids.filter((id) => id !== first);
    const buyerIsFor = recipients.some((r) => r.memberUserId === gift.buyerUserId);
    await ctx.db.patch('gifts', gift._id, {
      recipientId: first,
      alsoForIds: others.length > 0 ? others : undefined,
      ...(gift.buyerUserId !== undefined && buyerIsFor ? { buyerUserId: undefined } : {}),
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
    // A family member without the app has one name, on the Family tab too.
    if (recipient.familyMemberId !== undefined) {
      const person = await ctx.db.get('familyMembers', recipient.familyMemberId);
      if (person !== null && person.userId === undefined && person.name !== name) {
        await ctx.db.patch('familyMembers', person._id, { name });
      }
    }
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
    // Someone in the family keeps their place in Familien; they leave it from the Family tab.
    if ((await familyCircle(ctx, recipient.groupId))(recipient).inFamily) {
      throw new ConvexError({ code: 'IN_FAMILY' });
    }
    await deleteRecipient(ctx, recipient._id);
  },
});

async function deleteRecipient(ctx: MutationCtx, recipientId: Id<'giftRecipients'>) {
  const recipient = (await ctx.db.get('giftRecipients', recipientId))!;
  // Their gifts go with them; a joint gift stays for the others.
  for (const gift of await allFamilyGifts(ctx, recipient.groupId)) {
    if (!isFor(gift, recipientId)) continue;
    const rest = forIds(gift).filter((id) => id !== recipientId);
    if (rest.length === 0) {
      await ctx.db.delete('gifts', gift._id);
    } else {
      await ctx.db.patch('gifts', gift._id, {
        recipientId: rest[0],
        alsoForIds: rest.length > 1 ? rest.slice(1) : undefined,
      });
    }
  }
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
  // All gifts at once first, so each recipient's clean-up finds none left to read.
  for (const gift of await allFamilyGifts(ctx, groupId)) await ctx.db.delete('gifts', gift._id);
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

/**
 * Makes a plain gift recipient a family member without the app (#95): they move into the
 * Familien group with their gifts, ideas and history. Refused for a recipient linked to a
 * member (who already is, or was, in the family with an account) or already family.
 */
export const moveRecipientToFamily = mutation({
  args: { recipientId: v.id('giftRecipients') },
  handler: async (ctx, args) => {
    const { recipient } = await loadRecipient(ctx, args.recipientId);
    if (recipient.memberUserId !== undefined || recipient.familyMemberId !== undefined) {
      throw new ConvexError({ code: 'CANNOT_MOVE_TO_FAMILY' });
    }
    return await personFromRecipient(ctx, recipient);
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
