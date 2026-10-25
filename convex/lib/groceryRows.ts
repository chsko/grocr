import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { weekRange, type Weekday } from './week';
import { isUnit, roundQty, scaleQty, type Unit } from './units';

// Grocery lines are materialized rows with provenance (Architecture doc §4-5): planning a dinner
// writes one row per recipe ingredient onto the list of the week it is planned in. The rules for
// keeping them in sync live here so planning, servings changes and recipe edits share them:
// - unchecked, unedited rows follow the recipe and servings;
// - checked rows count as bought, and rows someone has at home count the same: if servings go
//   up, a new row holds the extra amount;
// - once a line is edited, removed or carried over by hand, sync leaves that dinner's ingredient
//   alone, whatever unit the edit used.

const MASS: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME: Record<string, number> = { ml: 1, cl: 10, dl: 100, l: 1000 };

/** Rows of one ingredient sum together when they share this key. */
function amountKey(ingredientId: Id<'ingredients'> | undefined, unit: string | undefined) {
  const fam = unit && MASS[unit] ? 'mass' : unit && VOLUME[unit] ? 'volume' : `unit:${unit ?? ''}`;
  return `${ingredientId ?? ''}|${fam}`;
}

function toBase(qty: number, unit: string | undefined) {
  return qty * ((unit && (MASS[unit] ?? VOLUME[unit])) || 1);
}

function fromBase(qty: number, unit: string | undefined) {
  return qty / ((unit && (MASS[unit] ?? VOLUME[unit])) || 1);
}

/** The week's list for `date`, created if missing. Each list keeps its own date range. */
export async function listForDate(ctx: MutationCtx, group: Doc<'groups'>, date: string) {
  const { startDate, endDate } = weekRange(date, group.weekStartsOn as Weekday);
  return await getOrCreateList(ctx, group._id, startDate, endDate);
}

export async function findList(ctx: QueryCtx, groupId: Id<'groups'>, startDate: string) {
  return await ctx.db
    .query('groceryLists')
    .withIndex('by_group_startDate', (q) => q.eq('groupId', groupId).eq('startDate', startDate))
    .unique();
}

export async function getOrCreateList(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  startDate: string,
  endDate: string,
) {
  const existing = await findList(ctx, groupId, startDate);
  if (existing !== null) return existing._id;
  return await ctx.db.insert('groceryLists', { groupId, startDate, endDate });
}

export async function rowsForEntry(ctx: QueryCtx, entryId: Id<'mealPlanEntries'>) {
  return await ctx.db
    .query('groceryItems')
    .withIndex('by_entry', (q) => q.eq('source.mealPlanEntryId', entryId))
    .collect();
}

type Wanted = {
  ingredient: Doc<'ingredients'>;
  qty?: number;
  unit?: Unit;
};

/** What the recipe asks for at the entry's servings, one amount per ingredient and unit family. */
async function wantedRows(ctx: QueryCtx, recipe: Doc<'recipes'>, servings: number) {
  const wanted = new Map<string, Wanted>();
  for (const line of recipe.ingredients) {
    const ingredient = await ctx.db.get('ingredients', line.ingredientId);
    if (ingredient === null || ingredient.groupId !== recipe.groupId) continue;
    const unit = line.unit && isUnit(line.unit) ? line.unit : undefined;
    const qty = scaleQty(line.qty, unit, recipe.servings, servings);
    const key = amountKey(ingredient._id, unit);
    const prev = wanted.get(key);
    if (prev === undefined) {
      wanted.set(key, { ingredient, qty, unit });
    } else if (qty !== undefined) {
      // Same ingredient twice in one recipe: add up in the first line's unit.
      const sum = toBase(prev.qty ?? 0, prev.unit) + toBase(qty, unit);
      prev.qty = roundQty(fromBase(sum, prev.unit ?? unit), prev.unit ?? unit);
      prev.unit = prev.unit ?? unit;
    }
  }
  return wanted;
}

/**
 * Brings an entry's grocery rows in line with its recipe and servings, following the rules at
 * the top of this file. An entry without a recipe (a note like "Pizza night") wants nothing.
 */
export async function syncEntry(ctx: MutationCtx, entry: Doc<'mealPlanEntries'>) {
  const group = await ctx.db.get('groups', entry.groupId);
  if (group === null) return;
  const recipe = entry.recipeId ? await ctx.db.get('recipes', entry.recipeId) : null;
  const wanted =
    recipe && recipe.groupId === entry.groupId
      ? await wantedRows(ctx, recipe, entry.servings)
      : new Map<string, Wanted>();

  const rows = (await rowsForEntry(ctx, entry._id)).filter((r) => r.groupId === entry.groupId);
  const byKey = new Map<string, Doc<'groceryItems'>[]>();
  for (const row of rows) {
    const key = amountKey(row.ingredientId, row.unit);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  let listId: Id<'groceryLists'> | undefined;
  const now = Date.now();

  for (const [key, want] of wanted) {
    const existing = byKey.get(key) ?? [];
    byKey.delete(key);
    if (rows.some((r) => r.ingredientId === want.ingredient._id && r.edited)) continue;
    const open = existing.filter((r) => !r.checked && !r.atHome);
    const bought = existing.filter((r) => r.checked || r.atHome);

    let qty: number | undefined;
    let needed: boolean;
    if (want.qty === undefined) {
      qty = undefined;
      needed = bought.length === 0;
    } else {
      const boughtBase = bought.reduce((sum, r) => sum + toBase(r.qty ?? 0, r.unit), 0);
      const remaining = toBase(want.qty, want.unit) - boughtBase;
      needed = remaining > 1e-9;
      qty = needed ? roundQty(fromBase(remaining, want.unit), want.unit) : undefined;
    }

    const [keep, ...extra] = open;
    for (const row of extra) await ctx.db.delete('groceryItems', row._id);
    if (!needed) {
      if (keep) await ctx.db.delete('groceryItems', keep._id);
      continue;
    }
    const fields = {
      ingredientId: want.ingredient._id,
      name: want.ingredient.name,
      section: want.ingredient.section,
      qty,
      unit: want.unit,
    };
    if (keep) {
      await ctx.db.patch('groceryItems', keep._id, fields);
    } else {
      listId ??= await listForDate(ctx, group, entry.date);
      await ctx.db.insert('groceryItems', {
        ...fields,
        groupId: entry.groupId,
        listId,
        checked: false,
        edited: false,
        source: { kind: 'meal', mealPlanEntryId: entry._id, recipeId: entry.recipeId! },
        createdAt: now,
      });
    }
  }

  // Ingredients the recipe no longer has: open, unedited rows go; bought, at-home or edited ones
  // stay (so an at-home mark survives a recipe edit that changes the unit).
  for (const rest of byKey.values()) {
    for (const row of rest) {
      if (!row.checked && !row.atHome && !row.edited) await ctx.db.delete('groceryItems', row._id);
    }
  }
}

/**
 * Before an entry is deleted: its open, unedited rows leave the list, and rows someone checked
 * or edited stay as manual items (Product plan §4.6). Unedited at-home rows leave too: nobody
 * needs to buy them, and keeping them would only clutter the at-home group.
 */
export async function detachEntry(ctx: MutationCtx, entry: Doc<'mealPlanEntries'>) {
  for (const row of await rowsForEntry(ctx, entry._id)) {
    if (row.groupId !== entry.groupId) continue;
    if (row.removed || (!row.checked && !row.edited)) {
      await ctx.db.delete('groceryItems', row._id);
    } else {
      await ctx.db.patch('groceryItems', row._id, {
        source: { kind: 'manual', addedBy: entry.addedBy },
      });
    }
  }
}
