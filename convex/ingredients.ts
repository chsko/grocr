import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { accessError, loadForMember, requireMembership } from './lib/access';
import { cleanName, guessSection, isSection, normalizeName } from './lib/catalog';
import { jevEnabled } from './lib/jev';

/** Catalog matches for autocomplete: names starting with the text first, then containing it. */
export const search = query({
  args: { groupId: v.id('groups'), text: v.string() },
  handler: async (ctx, { groupId, text }) => {
    await requireMembership(ctx, groupId);
    const needle = normalizeName(text);
    if (needle === '') return [];
    const all = await ctx.db
      .query('ingredients')
      .withIndex('by_group_normalizedName', (q) => q.eq('groupId', groupId))
      .collect();
    const matches = all.filter(
      (i) => i.normalizedName.includes(needle) || i.aliases.some((a) => a.includes(needle)),
    );
    const rank = (name: string) => (name.startsWith(needle) ? 0 : 1);
    return matches
      .sort(
        (a, b) => rank(a.normalizedName) - rank(b.normalizedName) || a.name.localeCompare(b.name),
      )
      .slice(0, 8)
      .map((i) => ({ _id: i._id, name: i.name, section: i.section, defaultUnit: i.defaultUnit }));
  },
});

/** A member moves a catalog item to another section; every list shows it there from now on. */
export const setSection = mutation({
  args: { ingredientId: v.id('ingredients'), section: v.string() },
  handler: async (ctx, { ingredientId, section }) => {
    const { doc } = await loadForMember(ctx, 'ingredients', ingredientId);
    if (!isSection(section)) throw new ConvexError({ code: 'INVALID_SECTION' });
    await ctx.db.patch('ingredients', doc._id, { section, sectionSource: 'user' });
  },
});

/**
 * Merges a duplicate catalog item into another ("Melk" into "Helmelk", GRO-31): recipes and
 * grocery lines switch to the kept item, the old name becomes its alias so typing it again finds
 * the kept item, and the duplicate is deleted.
 */
export const merge = mutation({
  args: { fromId: v.id('ingredients'), intoId: v.id('ingredients') },
  handler: async (ctx, { fromId, intoId }) => {
    const { doc: from } = await loadForMember(ctx, 'ingredients', fromId);
    const { doc: into } = await loadForMember(ctx, 'ingredients', intoId);
    if (from.groupId !== into.groupId) throw accessError('NOT_FOUND');
    if (from._id === into._id) throw new ConvexError({ code: 'SAME_INGREDIENT' });
    const groupId = into.groupId;

    const recipes = await ctx.db
      .query('recipes')
      .withIndex('by_group', (q) => q.eq('groupId', groupId))
      .collect();
    for (const recipe of recipes) {
      if (!recipe.ingredients.some((line) => line.ingredientId === fromId)) continue;
      await ctx.db.patch('recipes', recipe._id, {
        ingredients: recipe.ingredients.map((line) =>
          line.ingredientId === fromId ? { ...line, ingredientId: intoId } : line,
        ),
      });
    }

    const lists = await ctx.db
      .query('groceryLists')
      .withIndex('by_group_startDate', (q) => q.eq('groupId', groupId))
      .collect();
    for (const list of lists) {
      const items = await ctx.db
        .query('groceryItems')
        .withIndex('by_list', (q) => q.eq('listId', list._id))
        .collect();
      const intoEntries = new Set(
        items.flatMap((i) =>
          i.ingredientId === intoId && i.source.kind === 'meal' ? [i.source.mealPlanEntryId] : [],
        ),
      );
      for (const item of items) {
        if (item.ingredientId !== fromId) continue;
        // A removed line of the duplicate would freeze the kept item for that dinner (sync leaves
        // edited ingredients alone), so it goes when the dinner also has the kept item.
        if (
          item.removed &&
          item.source.kind === 'meal' &&
          intoEntries.has(item.source.mealPlanEntryId)
        ) {
          await ctx.db.delete('groceryItems', item._id);
          continue;
        }
        await ctx.db.patch('groceryItems', item._id, {
          ingredientId: intoId,
          name: into.name,
          section: into.section,
        });
      }
    }

    const aliases = new Set([...into.aliases, from.normalizedName, ...from.aliases]);
    aliases.delete(into.normalizedName);
    await ctx.db.patch('ingredients', intoId, { aliases: [...aliases] });
    const fromAliases = await ctx.db
      .query('ingredientAliases')
      .withIndex('by_ingredient', (q) => q.eq('ingredientId', fromId))
      .collect();
    for (const alias of fromAliases) {
      await ctx.db.patch('ingredientAliases', alias._id, { ingredientId: intoId });
    }
    await ctx.db.insert('ingredientAliases', {
      groupId,
      normalizedName: from.normalizedName,
      ingredientId: intoId,
    });
    await ctx.db.delete('ingredients', fromId);
  },
});

/**
 * The catalog item for a recipe or grocery line: the given id after checking it belongs to the
 * family, else the item with the same name, else a new one with a guessed section.
 */
export async function resolveIngredient(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  input: { ingredientId?: Id<'ingredients'>; name: string },
) {
  if (input.ingredientId !== undefined) {
    const doc = await ctx.db.get('ingredients', input.ingredientId);
    if (doc !== null && doc.groupId !== groupId) throw accessError('NOT_FOUND');
    if (doc !== null) return doc;
    // Gone, e.g. merged away while a recipe was open in the editor: resolve by name instead.
  }
  const name = cleanName(input.name).slice(0, 80);
  if (name === '') throw new ConvexError({ code: 'NAME_REQUIRED' });
  const normalizedName = normalizeName(name);
  const existing = await ctx.db
    .query('ingredients')
    .withIndex('by_group_normalizedName', (q) =>
      q.eq('groupId', groupId).eq('normalizedName', normalizedName),
    )
    .first();
  if (existing !== null) return existing;
  // A name merged into another item (see `merge`) resolves to that item.
  const alias = await ctx.db
    .query('ingredientAliases')
    .withIndex('by_group_name', (q) =>
      q.eq('groupId', groupId).eq('normalizedName', normalizedName),
    )
    .first();
  const aliased = alias && (await ctx.db.get('ingredients', alias.ingredientId));
  if (aliased) return aliased;
  const id = await ctx.db.insert('ingredients', {
    groupId,
    name,
    normalizedName,
    section: guessSection(name),
    sectionSource: 'guess',
    aliases: [],
  });
  if (jevEnabled() && (await takeJevCall(ctx, groupId))) {
    await ctx.scheduler.runAfter(0, internal.classify.section, { ingredientId: id });
  }
  return (await ctx.db.get('ingredients', id))!;
}

/** Most jev sorting calls one family can trigger per day; past it, items keep the keyword guess. */
export const JEV_DAILY_LIMIT = 200;

async function takeJevCall(ctx: MutationCtx, groupId: Id<'groups'>) {
  const group = await ctx.db.get('groups', groupId);
  if (group === null) return false;
  const day = new Date().toISOString().slice(0, 10);
  const count = group.jevUsage?.day === day ? group.jevUsage.count : 0;
  if (count >= JEV_DAILY_LIMIT) return false;
  await ctx.db.patch('groups', groupId, { jevUsage: { day, count: count + 1 } });
  return true;
}
