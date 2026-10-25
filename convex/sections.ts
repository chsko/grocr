import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, type MutationCtx } from './_generated/server';
import { scheduleSort } from './classify';
import { requireMembership } from './lib/access';
import {
  cleanName,
  familySections,
  guessSection,
  isSection,
  MAX_SECTION_NAME,
  MAX_SECTIONS,
  normalizeName,
  placeSection,
  reorderSections,
  shownNames,
  type FamilySection,
} from './lib/catalog';

// A family's grocery list sections (GRO-51): any member adds, renames, deletes and reorders them,
// like the rest of the family's content. They are stored on the group in store order.

async function loadSections(ctx: MutationCtx, groupId: Id<'groups'>) {
  await requireMembership(ctx, groupId);
  const group = (await ctx.db.get('groups', groupId))!;
  return { group, sections: familySections(group) };
}

async function saveSections(ctx: MutationCtx, groupId: Id<'groups'>, sections: FamilySection[]) {
  await ctx.db.patch('groups', groupId, { sections, sectionOrder: undefined });
}

/** A cleaned-up section name that no other section of the family already has. */
function validName(name: string, sections: FamilySection[], except?: string) {
  const clean = cleanName(name).slice(0, MAX_SECTION_NAME).trim();
  if (clean === '') throw new ConvexError({ code: 'NAME_REQUIRED' });
  const taken = sections.some(
    (s) =>
      s.key !== except &&
      shownNames(s).some((shown) => normalizeName(shown) === normalizeName(clean)),
  );
  if (taken) throw new ConvexError({ code: 'SECTION_EXISTS' });
  return clean;
}

function findSection(sections: FamilySection[], key: string) {
  const section = sections.find((s) => s.key === key);
  if (section === undefined) throw new ConvexError({ code: 'NOT_FOUND' });
  return section;
}

/** Most items jev looks at again when a section is added or renamed (RESORT_ITEMS / 20 calls). */
export const RESORT_ITEMS = 100;

/**
 * The family's items jev may move into a section: the newest RESORT_ITEMS of those a member
 * hasn't sorted by hand, so editing sections never costs more than a few jev calls.
 */
async function sortableItems(ctx: MutationCtx, group: Doc<'groups'>, into: string) {
  const items = await ctx.db
    .query('ingredients')
    .withIndex('by_group_normalizedName', (q) => q.eq('groupId', group._id))
    .collect();
  return items
    .filter((i) => i.sectionSource !== 'user' && i.section !== into)
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, RESORT_ITEMS)
    .map((i) => i._id);
}

/** Adds a section at the end of the store order; jev then moves the items that belong there. */
export const add = mutation({
  args: { groupId: v.id('groups'), name: v.string() },
  handler: async (ctx, { groupId, name }) => {
    const { group, sections } = await loadSections(ctx, groupId);
    if (sections.length >= MAX_SECTIONS) throw new ConvexError({ code: 'TOO_MANY_SECTIONS' });
    const clean = validName(name, sections);
    // Never reused, so an old line's section can't turn up under a new one.
    const key = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // Before "other", which stays last unless the family moved it.
    const last = sections[sections.length - 1];
    const next =
      last.key === 'other'
        ? [...sections.slice(0, -1), { key, name: clean }, last]
        : [...sections, { key, name: clean }];
    await saveSections(ctx, groupId, next);
    await scheduleSort(ctx, groupId, await sortableItems(ctx, group, key), {
      into: key,
      reserve: true,
    });
    return key;
  },
});

/**
 * Renames a section. An empty name gives a built-in section its standard (translated) name back;
 * the family's own sections need a name. jev then pulls in items that fit the new name.
 */
export const rename = mutation({
  args: { groupId: v.id('groups'), key: v.string(), name: v.string() },
  handler: async (ctx, { groupId, key, name }) => {
    const { group, sections } = await loadSections(ctx, groupId);
    const section = findSection(sections, key);
    const builtIn = isSection(key);
    const newName = builtIn && name.trim() === '' ? undefined : validName(name, sections, key);
    if (newName === section.name) return;
    await saveSections(
      ctx,
      groupId,
      sections.map((s) => (s.key === key ? { key, name: newName } : s)),
    );
    // Back to the standard name, or the same name in other letters, means nothing new for jev.
    const sameMeaning =
      newName === undefined ||
      (section.name !== undefined && normalizeName(section.name) === normalizeName(newName));
    if (key !== 'other' && !sameMeaning) {
      await scheduleSort(ctx, groupId, await sortableItems(ctx, group, key), {
        into: key,
        reserve: true,
      });
    }
  },
});

/**
 * Deletes a section. "other" stays, since items that fit nowhere go there. The section's items,
 * including ones a member put there, get the keyword guess among the remaining sections (or
 * "other"), and then jev sorts them again.
 */
export const remove = mutation({
  args: { groupId: v.id('groups'), key: v.string() },
  handler: async (ctx, { groupId, key }) => {
    if (key === 'other') throw new ConvexError({ code: 'CANNOT_DELETE_OTHER' });
    const { sections } = await loadSections(ctx, groupId);
    findSection(sections, key);
    const rest = sections.filter((s) => s.key !== key);
    await saveSections(ctx, groupId, rest);
    const keys = rest.map((s) => s.key);
    const items = await ctx.db
      .query('ingredients')
      .withIndex('by_group_normalizedName', (q) => q.eq('groupId', groupId))
      .collect();
    const moved = [];
    for (const item of items) {
      if (item.section !== key) continue;
      await ctx.db.patch('ingredients', item._id, {
        section: placeSection(guessSection(item.name), keys),
        sectionSource: 'guess',
      });
      moved.push(item._id);
    }
    await scheduleSort(ctx, groupId, moved);
  },
});

/** Puts the sections in the order the family walks through their store. */
export const reorder = mutation({
  args: { groupId: v.id('groups'), keys: v.array(v.string()) },
  handler: async (ctx, { groupId, keys }) => {
    const { sections } = await loadSections(ctx, groupId);
    await saveSections(ctx, groupId, reorderSections(sections, keys));
  },
});
