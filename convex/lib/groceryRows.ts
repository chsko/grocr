import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { normalizeName } from './catalog';
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
export function amountKey(ingredientId: Id<'ingredients'> | undefined, unit: string | undefined) {
  const fam = unit && MASS[unit] ? 'mass' : unit && VOLUME[unit] ? 'volume' : `unit:${unit ?? ''}`;
  return `${ingredientId ?? ''}|${fam}`;
}

export function toBase(qty: number, unit: string | undefined) {
  return qty * ((unit && (MASS[unit] ?? VOLUME[unit])) || 1);
}

export function fromBase(qty: number, unit: string | undefined) {
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
export async function syncEntry(
  ctx: MutationCtx,
  entry: Doc<'mealPlanEntries'>,
  /** The member whose change this is; rows it adds are theirs (GRO-70). */
  actor: Id<'users'>,
) {
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
        insertedBy: actor,
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
 * needs to buy them, and keeping them would only clutter the at-home group. What they said was
 * at home moves to the same item's rows from other dinners, if any, so "4 of the 12 carrots at
 * home" still counts when one of the two dinners needing carrots is removed.
 */
export async function detachEntry(ctx: MutationCtx, entry: Doc<'mealPlanEntries'>) {
  const moved = new Map<string, { row: Doc<'groceryItems'>; base: number }>();
  for (const row of await rowsForEntry(ctx, entry._id)) {
    if (row.groupId !== entry.groupId) continue;
    if (row.removed || (!row.checked && !row.edited)) {
      await ctx.db.delete('groceryItems', row._id);
      if (row.atHome && !row.removed && row.qty !== undefined) {
        const key = `${row.listId}|${amountKey(row.ingredientId, row.unit)}`;
        const prev = moved.get(key);
        moved.set(key, { row, base: (prev?.base ?? 0) + toBase(row.qty, row.unit) });
      }
    } else {
      await ctx.db.patch('groceryItems', row._id, {
        source: { kind: 'manual', addedBy: entry.addedBy },
      });
    }
  }
  for (const { row, base } of moved.values()) {
    const rest = await itemRowsOnList(ctx, row);
    const family = amountKey(undefined, row.unit);
    const home = rest
      .filter((r) => r.atHome && r.qty !== undefined && amountKey(undefined, r.unit) === family)
      .reduce((sum, r) => sum + toBase(r.qty!, r.unit), 0);
    await setAtHomeOnRows(ctx, rest, home + base, row.unit);
  }
}

/** Open and at-home rows of the same item as `row` on its list (not bought, not removed). */
export async function itemRowsOnList(ctx: QueryCtx, row: Doc<'groceryItems'>) {
  const item = (r: Doc<'groceryItems'>) => r.ingredientId ?? `name:${normalizeName(r.name)}`;
  return (
    await ctx.db
      .query('groceryItems')
      .withIndex('by_list', (q) => q.eq('listId', row.listId))
      .collect()
  ).filter((r) => r.groupId === row.groupId && !r.removed && !r.checked && item(r) === item(row));
}

/**
 * Rows that came from the same place and can stand for each other: same list, item, unit family,
 * dinner (or added by hand by the same member) and edited state. Splitting a line into "to buy"
 * and "at home" only ever happens within one such group.
 */
export function siblingKey(row: Doc<'groceryItems'>) {
  const source =
    row.source.kind === 'meal'
      ? `meal:${row.source.mealPlanEntryId}`
      : `manual:${row.source.addedBy ?? ''}`;
  const item = row.ingredientId ?? `name:${normalizeName(row.name)}`;
  return [row.listId, item, amountKey(undefined, row.unit), row.edited, source].join('|');
}

/** Drops float noise (0.30000000000000004) without rounding real amounts. */
export function cleanQty(qty: number) {
  return Math.round(qty * 1e6) / 1e6;
}

/**
 * Puts `homeBase` (in base units of `unit`'s family) of an item's open and at-home rows at home
 * and the rest on the list. Only rows with an amount in that family count. Each sibling group
 * keeps at most one open row and one at-home row, so a dinner's rows still sync: the at-home row
 * counts as bought and the open row follows servings changes for the remainder.
 */
export async function setAtHomeOnRows(
  ctx: MutationCtx,
  rows: Doc<'groceryItems'>[],
  homeBase: number,
  unit: string | undefined,
) {
  const family = amountKey(undefined, unit);
  const groups = new Map<string, Doc<'groceryItems'>[]>();
  for (const row of [...rows].sort((a, b) => a.createdAt - b.createdAt)) {
    if (row.checked || row.removed) continue;
    if (row.qty === undefined || amountKey(undefined, row.unit) !== family) continue;
    const key = siblingKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let left = homeBase;
  for (const group of groups.values()) {
    const total = group.reduce((sum, r) => sum + toBase(r.qty!, r.unit), 0);
    if (total <= 1e-9) continue;
    const home = Math.min(Math.max(left, 0), total);
    left -= home;
    const wanted = [
      { atHome: true, base: home },
      { atHome: false, base: total - home },
    ].filter((w) => w.base > 1e-9);
    // Each wanted row reuses a row already in that state, then any row left, then a copy of the
    // first, so a line split for the first time keeps its id on the part still to buy.
    const pool = [...group];
    const take = (atHome: boolean) => {
      const index = pool.findIndex((r) => (r.atHome ?? false) === atHome);
      return index >= 0 ? pool.splice(index, 1)[0] : undefined;
    };
    const rowsFor = wanted.map((w) => take(w.atHome));
    for (const [i, want] of wanted.entries()) {
      const row = rowsFor[i] ?? pool.shift();
      const fields = { atHome: want.atHome ? true : undefined };
      if (row) {
        await ctx.db.patch('groceryItems', row._id, {
          ...fields,
          qty: cleanQty(fromBase(want.base, row.unit)),
        });
      } else {
        const { _id, _creationTime, ...template } = group[0];
        await ctx.db.insert('groceryItems', {
          ...template,
          ...fields,
          qty: cleanQty(fromBase(want.base, template.unit)),
        });
      }
    }
    for (const row of pool) await ctx.db.delete('groceryItems', row._id);
  }
}
