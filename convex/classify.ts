import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { familySections, isSection, type FamilySection } from './lib/catalog';
import { isRecipeIcon, RECIPE_ICONS } from './lib/recipeIcons';
import { askJevChoices, jevEnabled, type JevQuestion } from './lib/jev';

// jev sorts catalog items into the family's own sections (GRO-51): a new item a moment after it
// is added, so unknown words ("halloumi", "sriracha") stop landing in "other"; and the family's
// items again when they add, rename or delete a section. A member's own choice always wins.

/** jev must be at least this sure before it moves an item. */
export const MIN_CONFIDENCE = 0.6;

/** Most jev calls one family can trigger per day; past it, items keep the keyword guess. */
export const JEV_DAILY_LIMIT = 200;

/** jev calls a day kept for new items, which re-sorting after a section edit may not use. */
export const JEV_RESERVE = 50;

/** Items jev sorts in one call. */
export const SORT_BATCH = 20;

/** What each built-in section holds, so jev knows "dry" from "Tørrvarer". */
export const SECTION_HINTS = {
  produce: 'Fruit, vegetables, fresh herbs, salad (frukt og grønt)',
  meat: 'Fresh or cured meat, poultry, fish and seafood (kjøtt og fisk)',
  dairy: 'Milk, cheese, butter, yoghurt, cream, eggs (meieri og egg)',
  bakery: 'Bread, rolls, tortillas, cakes (bakeri)',
  dry: 'Pasta, rice, flour, cans, jars, sauces, spices, oils, snacks, drinks (tørrvarer)',
  frozen: 'Frozen food (frysevarer)',
  household: 'Non-food: cleaning, paper, toiletries (husholdning)',
  other: 'Anything that fits none of the other sections (annet)',
};

/** How jev sees one of the family's sections. */
export function describeSection(section: FamilySection) {
  if (!isSection(section.key)) return `${section.name} (a section this family made themselves)`;
  const hint = SECTION_HINTS[section.key];
  return section.name === undefined ? hint : `${section.name} (renamed by the family; ${hint})`;
}

/**
 * Asks jev to sort these catalog items into the family's sections, one call per SORT_BATCH items
 * while the family's daily jev allowance lasts. With `into`, jev may only move items into that
 * section (a section they just added or renamed pulls in what belongs there, and leaves the rest).
 * With `reserve`, the last JEV_RESERVE calls of the day are left for new items.
 */
export async function scheduleSort(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  ingredientIds: Id<'ingredients'>[],
  { into, reserve = false }: { into?: string; reserve?: boolean } = {},
) {
  if (!jevEnabled()) return;
  const limit = reserve ? JEV_DAILY_LIMIT - JEV_RESERVE : JEV_DAILY_LIMIT;
  for (let i = 0; i < ingredientIds.length; i += SORT_BATCH) {
    if (!(await takeJevCall(ctx, groupId, limit))) return;
    await ctx.scheduler.runAfter(0, internal.classify.sort, {
      groupId,
      ingredientIds: ingredientIds.slice(i, i + SORT_BATCH),
      into,
    });
  }
}

/**
 * Asks jev for an icon for a recipe whose title the keywords don't know ("Fredagskos",
 * "Mormors lørdagsmiddag"), once per title, while the family's daily jev allowance lasts.
 */
export async function scheduleIconGuess(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  recipeId: Id<'recipes'>,
  title: string,
) {
  if (!jevEnabled()) return;
  // Icons are nice to have: they leave the reserve to new grocery items.
  if (!(await takeJevCall(ctx, groupId, JEV_DAILY_LIMIT - JEV_RESERVE))) return;
  await ctx.db.patch('recipes', recipeId, { iconAskedFor: title });
  await ctx.scheduler.runAfter(0, internal.classify.icon, { recipeId });
}

async function takeJevCall(ctx: MutationCtx, groupId: Id<'groups'>, limit: number) {
  const group = await ctx.db.get('groups', groupId);
  if (group === null) return false;
  const day = new Date().toISOString().slice(0, 10);
  const count = group.jevUsage?.day === day ? group.jevUsage.count : 0;
  if (count >= limit) return false;
  await ctx.db.patch('groups', groupId, { jevUsage: { day, count: count + 1 } });
  return true;
}

/** The family's sections and those of the items jev may still move. */
export const sortInput = internalQuery({
  args: { groupId: v.id('groups'), ingredientIds: v.array(v.id('ingredients')) },
  handler: async (ctx, { groupId, ingredientIds }) => {
    const group = await ctx.db.get('groups', groupId);
    if (group === null) return null;
    const items = [];
    for (const id of ingredientIds) {
      const doc = await ctx.db.get('ingredients', id);
      if (doc?.groupId === groupId && doc.sectionSource !== 'user') {
        items.push({ _id: doc._id, name: doc.name });
      }
    }
    return { sections: familySections(group), items };
  },
});

export const sort = internalAction({
  args: {
    groupId: v.id('groups'),
    ingredientIds: v.array(v.id('ingredients')),
    into: v.optional(v.string()),
  },
  handler: async (ctx, { groupId, ingredientIds, into }) => {
    const input = await ctx.runQuery(internal.classify.sortInput, { groupId, ingredientIds });
    if (input === null || input.items.length === 0) return;
    // Plain choice keys (s0, s1...), since a family's section names can be anything.
    const criteria = Object.fromEntries(
      input.sections.map((section, i) => [`s${i}`, describeSection(section)]),
    );
    const questions: Record<string, JevQuestion> = {};
    input.items.forEach((item, i) => {
      questions[`i${i}`] = {
        instructions:
          `Which section of this family's grocery list does the item ${JSON.stringify(item.name)} ` +
          'belong in? The name may be Norwegian or English. A section the family made themselves ' +
          'is more specific: pick it whenever the item fits it.',
        criteria,
      };
    });
    const answers = await askJevChoices(
      { store: 'Norwegian grocery store', items: input.items.map((item) => item.name) },
      questions,
    );
    const moves = input.items.flatMap((item, i) => {
      const answer = answers[`i${i}`];
      if (answer === null || answer.confidence < MIN_CONFIDENCE) return [];
      const section = input.sections[Number(answer.choice.slice(1))].key;
      if (into !== undefined && section !== into) return [];
      return [{ ingredientId: item._id, section }];
    });
    if (moves.length > 0)
      await ctx.runMutation(internal.classify.applySections, { groupId, moves });
  },
});

/**
 * Stores jev's sections, except for items a member has sorted in the meantime and sections the
 * family has deleted since jev was asked.
 */
export const applySections = internalMutation({
  args: {
    groupId: v.id('groups'),
    moves: v.array(v.object({ ingredientId: v.id('ingredients'), section: v.string() })),
  },
  handler: async (ctx, { groupId, moves }) => {
    const group = await ctx.db.get('groups', groupId);
    if (group === null) return;
    const keys = familySections(group).map((s) => s.key);
    for (const { ingredientId, section } of moves) {
      const doc = await ctx.db.get('ingredients', ingredientId);
      if (doc?.groupId !== groupId || doc.sectionSource === 'user') continue;
      if (!keys.includes(section) || doc.section === section) continue;
      await ctx.db.patch('ingredients', ingredientId, { section, sectionSource: 'jev' });
    }
  },
});

/** The recipe's title and ingredients, while it still has no icon of its own. */
export const iconInput = internalQuery({
  args: { recipeId: v.id('recipes') },
  handler: async (ctx, { recipeId }) => {
    const recipe = await ctx.db.get('recipes', recipeId);
    if (recipe === null || recipe.icon !== undefined) return null;
    const ingredients = [];
    for (const line of recipe.ingredients) {
      const doc = await ctx.db.get('ingredients', line.ingredientId);
      if (doc !== null) ingredients.push(doc.name);
    }
    return { title: recipe.title, ingredients };
  },
});

export const icon = internalAction({
  args: { recipeId: v.id('recipes') },
  handler: async (ctx, { recipeId }) => {
    const input = await ctx.runQuery(internal.classify.iconInput, { recipeId });
    if (input === null) return;
    // Plain choice keys (c0, c1...); the plate is jev's way of saying none fits.
    const criteria = Object.fromEntries(
      RECIPE_ICONS.map(({ icon, words }, i) => [
        `c${i}`,
        words.length > 0 ? `${icon} (${words.join(', ')})` : `${icon} (none of the others fits)`,
      ]),
    );
    const { pick } = await askJevChoices(
      { dinner: input.title, ingredients: input.ingredients },
      {
        pick: {
          instructions:
            'Which food icon best shows this family dinner recipe? The title may be Norwegian ' +
            'or English; use the ingredients when the title alone is unclear.',
          criteria,
        },
      },
    );
    if (pick === null || pick.confidence < MIN_CONFIDENCE) return;
    await ctx.runMutation(internal.classify.applyIcon, {
      recipeId,
      title: input.title,
      icon: RECIPE_ICONS[Number(pick.choice.slice(1))].icon,
    });
  },
});

/** Stores jev's icon, unless the recipe was renamed or given an icon in the meantime. */
export const applyIcon = internalMutation({
  args: { recipeId: v.id('recipes'), title: v.string(), icon: v.string() },
  handler: async (ctx, { recipeId, title, icon }) => {
    const recipe = await ctx.db.get('recipes', recipeId);
    if (recipe === null || recipe.title !== title || recipe.icon !== undefined) return;
    if (!isRecipeIcon(icon)) return;
    await ctx.db.patch('recipes', recipeId, { guessedIcon: icon });
  },
});
