import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { resolveIngredient } from './ingredients';
import { getMembership, requireMemberOf, requireMembership, requireUserId } from './lib/access';
import { findList, getOrCreateList } from './lib/groceryRows';
import { isUnit } from './lib/units';
import { sectionOrder } from './lib/catalog';
import { addDays, isLocalDate, startOfWeek, type Weekday } from './lib/week';

/**
 * The grocery list for the week starting `startDate` (null if nothing was added yet), with the
 * dinner each meal line came from, and whether last week's list has unchecked items to offer
 * moving over (only until someone moves or dismisses them).
 */
export const listForWeek = query({
  args: { groupId: v.id('groups'), startDate: v.string() },
  handler: async (ctx, { groupId, startDate }) => {
    await requireMembership(ctx, groupId);
    const list = await findList(ctx, groupId, startDate);
    const items = list
      ? await ctx.db
          .query('groceryItems')
          .withIndex('by_list', (q) => q.eq('listId', list._id))
          .collect()
          .then((rows) => rows.filter((r) => !r.removed))
      : [];

    const sources: Record<string, { date: string; title: string }> = {};
    const addedBy: Record<string, string> = {};
    for (const item of items) {
      if (item.source.kind === 'meal') {
        const entryId = item.source.mealPlanEntryId;
        if (sources[entryId] !== undefined) continue;
        const entry = await ctx.db.get('mealPlanEntries', entryId);
        const recipe = await ctx.db.get('recipes', item.source.recipeId);
        if (entry && recipe && entry.groupId === groupId && recipe.groupId === groupId) {
          sources[entryId] = { date: entry.date, title: recipe.title };
        }
      } else if (item.source.addedBy && addedBy[item.source.addedBy] === undefined) {
        const user = await ctx.db.get('users', item.source.addedBy);
        addedBy[item.source.addedBy] = user?.name ?? '';
      }
    }

    let carryOver: { count: number } | null = null;
    if (!list?.carryOverDismissed) {
      const previous = await findList(ctx, groupId, addDays(startDate, -7));
      if (previous !== null) {
        const open = await ctx.db
          .query('groceryItems')
          .withIndex('by_list', (q) => q.eq('listId', previous._id))
          .filter((q) => q.eq(q.field('checked'), false))
          .collect();
        const visible = open.filter((r) => !r.removed).length;
        if (visible > 0) carryOver = { count: visible };
      }
    }

    // Lines follow their catalog item's current section, so a move or jev's refinement shows on
    // every list at once.
    const sections = new Map<string, string>();
    for (const item of items) {
      if (item.ingredientId === undefined || sections.has(item.ingredientId)) continue;
      const ingredient = await ctx.db.get('ingredients', item.ingredientId);
      if (ingredient?.groupId === groupId) sections.set(item.ingredientId, ingredient.section);
    }
    const group = (await ctx.db.get('groups', groupId))!;

    return {
      listId: list?._id ?? null,
      sectionOrder: sectionOrder(group.sectionOrder),
      items: items.map((i) => ({
        _id: i._id,
        ingredientId: i.ingredientId ?? null,
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        section: (i.ingredientId && sections.get(i.ingredientId)) ?? i.section,
        checked: i.checked,
        edited: i.edited,
        source: i.source,
      })),
      sources,
      addedBy,
      carryOver,
    };
  },
});

/** The list for a week of the family's calendar, created if missing. */
async function weekList(ctx: MutationCtx, groupId: Id<'groups'>, startDate: string) {
  if (!isLocalDate(startDate)) throw new ConvexError({ code: 'INVALID_DATE' });
  const group = (await ctx.db.get('groups', groupId))!;
  // Only real week starts, so a list's range always matches the calendar.
  if (startOfWeek(startDate, group.weekStartsOn as Weekday) !== startDate) {
    throw new ConvexError({ code: 'INVALID_DATE' });
  }
  return await getOrCreateList(ctx, groupId, startDate, addDays(startDate, 6));
}

/**
 * Adds an item by hand to the list being viewed ("we're out of coffee"). It goes through the
 * catalog, so it merges with meal lines of the same ingredient.
 */
export const addManual = mutation({
  args: {
    groupId: v.id('groups'),
    startDate: v.string(),
    ingredientId: v.optional(v.id('ingredients')),
    name: v.string(),
    qty: v.optional(v.number()),
    unit: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireMembership(ctx, args.groupId);
    const ingredient = await resolveIngredient(ctx, args.groupId, args);
    const listId = await weekList(ctx, args.groupId, args.startDate);
    return await ctx.db.insert('groceryItems', {
      groupId: args.groupId,
      listId,
      ingredientId: ingredient._id,
      name: ingredient.name,
      qty:
        args.qty !== undefined && Number.isFinite(args.qty) && args.qty > 0 ? args.qty : undefined,
      unit: args.unit !== undefined && isUnit(args.unit) ? args.unit : undefined,
      section: ingredient.section,
      checked: false,
      edited: false,
      source: { kind: 'manual', addedBy: userId },
      createdAt: Date.now(),
    });
  },
});

/** Loads grocery rows, all from one list the caller's family owns. */
async function loadRows(ctx: MutationCtx, itemIds: Id<'groceryItems'>[]) {
  if (itemIds.length === 0 || itemIds.length > 100)
    throw new ConvexError({ code: 'TOO_MANY_ITEMS' });
  const rows: Doc<'groceryItems'>[] = [];
  for (const id of new Set(itemIds)) {
    const row = await ctx.db.get('groceryItems', id);
    if (row !== null) rows.push(row);
  }
  if (rows.length === 0) return rows;
  await requireMemberOf(ctx, rows[0]);
  if (rows.some((r) => r.listId !== rows[0].listId)) throw new ConvexError({ code: 'NOT_FOUND' });
  return rows;
}

/**
 * Edits a merged line ("3 onions" -> "1 onion"): every row behind it becomes edited, the new
 * amount goes on one row and the others are removed, so sync leaves the line alone from now on.
 */
export const editMerged = mutation({
  args: {
    itemIds: v.array(v.id('groceryItems')),
    qty: v.optional(v.number()),
    unit: v.optional(v.string()),
  },
  handler: async (ctx, { itemIds, qty, unit }) => {
    const rows = await loadRows(ctx, itemIds);
    if (rows.length === 0) return;
    const [keep, ...rest] = rows;
    await ctx.db.patch('groceryItems', keep._id, {
      qty: qty !== undefined && Number.isFinite(qty) && qty > 0 ? qty : undefined,
      unit: unit !== undefined && isUnit(unit) ? unit : undefined,
      edited: true,
    });
    for (const row of rest) await removeRow(ctx, row);
  },
});

/**
 * Takes a row off the list. Meal rows stay behind as hidden, edited tombstones so a later
 * servings change or recipe edit does not add them back; manual rows are deleted.
 */
async function removeRow(ctx: MutationCtx, row: Doc<'groceryItems'>) {
  if (row.source.kind === 'meal') {
    await ctx.db.patch('groceryItems', row._id, { removed: true, edited: true, checked: false });
  } else {
    await ctx.db.delete('groceryItems', row._id);
  }
}

/** Removes rows from the list. Rows that are already gone are skipped. */
export const remove = mutation({
  args: { itemIds: v.array(v.id('groceryItems')) },
  handler: async (ctx, { itemIds }) => {
    for (const row of await loadRows(ctx, itemIds)) await removeRow(ctx, row);
  },
});

/**
 * Takes the checked rows off a week's list ("Clear checked"). Bought meal rows stay as hidden
 * tombstones, so a later servings change does not put them back.
 */
export const clearChecked = mutation({
  args: { groupId: v.id('groups'), startDate: v.string() },
  handler: async (ctx, { groupId, startDate }) => {
    await requireMembership(ctx, groupId);
    const list = await findList(ctx, groupId, startDate);
    if (list === null) return 0;
    const checked = await ctx.db
      .query('groceryItems')
      .withIndex('by_list', (q) => q.eq('listId', list._id))
      .filter((q) => q.eq(q.field('checked'), true))
      .collect();
    for (const row of checked) await removeRow(ctx, row);
    return checked.length;
  },
});

/**
 * Moves last week's unchecked rows to this week's list as manual items, or (with `move` false)
 * just stops offering to. Either way the offer is gone for this week.
 */
export const carryOver = mutation({
  args: { groupId: v.id('groups'), startDate: v.string(), move: v.boolean() },
  handler: async (ctx, { groupId, startDate, move }) => {
    await requireMembership(ctx, groupId);
    const listId = await weekList(ctx, groupId, startDate);
    let moved = 0;
    const previous = await findList(ctx, groupId, addDays(startDate, -7));
    if (move && previous !== null) {
      const open = await ctx.db
        .query('groceryItems')
        .withIndex('by_list', (q) => q.eq('listId', previous._id))
        .filter((q) => q.eq(q.field('checked'), false))
        .collect();
      for (const row of open) {
        if (row.removed) continue;
        // Meal rows keep their dinner but count as edited, so syncing that dinner later
        // neither duplicates them nor pulls them back.
        await ctx.db.patch('groceryItems', row._id, { listId, edited: true });
        moved++;
      }
    }
    await ctx.db.patch('groceryLists', listId, { carryOverDismissed: true });
    return moved;
  },
});

/**
 * Sets (never toggles) the checked state of every row behind a merged line, so a resent
 * mutation after reconnect is harmless. Rows already in the requested state are left untouched,
 * which keeps the original `checkedBy`/`checkedAt`. Rows that are gone (e.g. "clear checked" ran
 * while this client was offline) and rows in a family the user is not a member of are skipped
 * alike, so the result never reveals whether another family's id exists. Returns how many rows
 * changed.
 */
export const setChecked = mutation({
  args: { itemIds: v.array(v.id('groceryItems')), checked: v.boolean() },
  handler: async (ctx, { itemIds, checked }) => {
    const userId = await requireUserId(ctx);
    if (itemIds.length > 100) throw new ConvexError({ code: 'TOO_MANY_ITEMS' });

    const memberOf = new Map<Id<'groups'>, boolean>();
    const isMember = async (groupId: Id<'groups'>) => {
      if (!memberOf.has(groupId)) {
        memberOf.set(groupId, (await getMembership(ctx, groupId, userId)) !== null);
      }
      return memberOf.get(groupId)!;
    };

    let changed = 0;
    const now = Date.now();
    for (const itemId of new Set(itemIds)) {
      const item = await ctx.db.get('groceryItems', itemId);
      if (item === null || !(await isMember(item.groupId)) || item.checked === checked) continue;
      await ctx.db.patch(
        'groceryItems',
        item._id,
        checked
          ? { checked, checkedBy: userId, checkedAt: now }
          : { checked, checkedBy: undefined, checkedAt: undefined },
      );
      changed++;
    }
    return changed;
  },
});
