import { cleanSectionName } from '@/convex/lib/recipeSections';

/**
 * The recipe editor's sections (#101): rows hold the key of the section they are in, or null
 * for the rows above every section. A section can be empty while it is being made; empty and
 * blank-named sections are dropped on save (the server cleans names again).
 */

export type EditorSection = { key: number; name: string };
type Placed = { key: number; section: number | null };

/** Sections and rows from a saved recipe's lines. */
export function fromLines<L extends { recipeSection?: string }>(
  lines: L[],
  nextKey: () => number,
): { sections: EditorSection[]; rows: (L & Placed)[] } {
  const sections: EditorSection[] = [];
  const byName = new Map<string, number>();
  const rows = lines.map((line) => {
    let section: number | null = null;
    if (line.recipeSection) {
      section = byName.get(line.recipeSection) ?? null;
      if (section === null) {
        section = nextKey();
        byName.set(line.recipeSection, section);
        sections.push({ key: section, name: line.recipeSection });
      }
    }
    return { ...line, key: nextKey(), section };
  });
  return { sections, rows };
}

/** The rows of one section (null: the rows above every section), in order. */
export function rowsIn<R extends Placed>(rows: R[], section: number | null): R[] {
  return rows.filter((r) => r.section === section);
}

export function addSection(sections: EditorSection[], key: number): EditorSection[] {
  return [...sections, { key, name: '' }];
}

/** Moves a row to another section (or out of all), as that section's last row. */
export function moveRow<R extends Placed>(rows: R[], rowKey: number, section: number | null): R[] {
  const row = rows.find((r) => r.key === rowKey);
  if (!row) return rows;
  return [...rows.filter((r) => r.key !== rowKey), { ...row, section }];
}

/** Removes a section; its rows go last into the section above, or above every section. */
export function removeSection<R extends Placed>(
  sections: EditorSection[],
  rows: R[],
  key: number,
): { sections: EditorSection[]; rows: R[] } {
  const index = sections.findIndex((s) => s.key === key);
  if (index < 0) return { sections, rows };
  const above = index > 0 ? sections[index - 1].key : null;
  const moved = rows.filter((r) => r.section === key).map((r) => ({ ...r, section: above }));
  return {
    sections: sections.filter((s) => s.key !== key),
    rows: [...rows.filter((r) => r.section !== key), ...moved],
  };
}

/** Rows in saving order, each with its section's name (undefined when it has none). */
export function sectionLines<R extends Placed>(
  rows: R[],
  sections: EditorSection[],
): (R & { recipeSection?: string })[] {
  return [null, ...sections.map((s) => s.key)].flatMap((key) => {
    const name = cleanSectionName(sections.find((s) => s.key === key)?.name);
    return rowsIn(rows, key).map((r) => ({ ...r, recipeSection: name }));
  });
}
