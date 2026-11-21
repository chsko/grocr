/**
 * Recipe sections (#101): named groups of a recipe's ingredients, such as "Saus". They only
 * change how a recipe reads; the grocery list ignores them. A line's section is its name, and
 * the lines of one section are stored next to each other, unsectioned lines first.
 *
 * "Section" alone means a store aisle (catalog items' `section`), so code says `recipeSection`.
 */

export const MAX_SECTION_NAME = 40;

/** A section's name as stored: trimmed, single spaces, no hidden characters; blank is none. */
export function cleanSectionName(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const clean = name
    // Control, zero-width and bidi characters.
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Count characters, not UTF-16 units, so an emoji is never cut in half.
  const capped = Array.from(clean).slice(0, MAX_SECTION_NAME).join('').trim();
  return capped === '' ? undefined : capped;
}

type Sectioned = { recipeSection?: string };

/**
 * Lines in the order a recipe keeps them: unsectioned first, then each section's lines
 * together, sections in the order they first appear. Names are cleaned, and names that differ
 * only by case are one section, spelled as it first appears.
 */
export function orderBySection<T extends Sectioned>(lines: T[]): T[] {
  const spelling = new Map<string, string>();
  const bySection = new Map<string, T[]>();
  const loose: T[] = [];
  for (const line of lines) {
    const name = cleanSectionName(line.recipeSection);
    if (name === undefined) {
      loose.push({ ...line, recipeSection: undefined });
      continue;
    }
    const key = name.toLocaleLowerCase('nb');
    if (!spelling.has(key)) {
      spelling.set(key, name);
      bySection.set(key, []);
    }
    bySection.get(key)!.push({ ...line, recipeSection: spelling.get(key) });
  }
  return [...loose, ...[...bySection.values()].flat()];
}

export type SectionGroup<T> = { name: string | null; lines: T[] };

/** Lines grouped for display: the unsectioned lines (name null) first, if any. */
export function groupBySection<T extends Sectioned>(lines: T[]): SectionGroup<T>[] {
  const groups: SectionGroup<T>[] = [];
  for (const line of orderBySection(lines)) {
    const name = line.recipeSection ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.lines.push(line);
    else groups.push({ name, lines: [line] });
  }
  return groups;
}

/**
 * Older app builds don't know sections and send none. Each item then keeps the section it has
 * in the stored recipe, so editing there doesn't wipe them.
 */
export function keepStoredSections<T extends { ingredientId: string }>(
  sent: T[],
  stored: { ingredientId: string; recipeSection?: string }[],
): (T & Sectioned)[] {
  // By occurrence: the same item can be in two sections, such as butter for the sauce and for
  // the top, and each line keeps its own.
  const had = new Map<string, (string | undefined)[]>();
  for (const line of stored) {
    const queue = had.get(line.ingredientId) ?? [];
    queue.push(line.recipeSection);
    had.set(line.ingredientId, queue);
  }
  return sent.map((line) => ({ ...line, recipeSection: had.get(line.ingredientId)?.shift() }));
}
