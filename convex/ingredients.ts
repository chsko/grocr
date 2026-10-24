import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { accessError, loadForMember, requireMembership } from './lib/access';
import { cleanName, guessSection, isSection, normalizeName } from './lib/catalog';

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

/** Changes the store section of a catalog item; lines added from then on use it. */
export const setSection = mutation({
  args: { ingredientId: v.id('ingredients'), section: v.string() },
  handler: async (ctx, { ingredientId, section }) => {
    const { doc } = await loadForMember(ctx, 'ingredients', ingredientId);
    if (!isSection(section)) throw new ConvexError({ code: 'INVALID_SECTION' });
    await ctx.db.patch('ingredients', doc._id, { section });
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
    if (doc === null || doc.groupId !== groupId) throw accessError('NOT_FOUND');
    return doc;
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
  const id = await ctx.db.insert('ingredients', {
    groupId,
    name,
    normalizedName,
    section: guessSection(name),
    aliases: [],
  });
  return (await ctx.db.get('ingredients', id))!;
}
