import { normalizeName, sectionRank } from './catalog';
import { isUnit, sumAmounts, type Amount } from './units';

// Display merge for the grocery list (Product plan §5.4): rows of the same ingredient become one
// line, "2 onions" (Tacos) + "1 onion" (Soup) = "3 onions" with both sources. Open and checked
// rows merge separately, so a line that is half bought shows what is still missing.

export type GroceryRow = {
  _id: string;
  ingredientId: string | null;
  name: string;
  qty?: number;
  unit?: string;
  section: string;
  checked: boolean;
  source: { kind: 'meal'; mealPlanEntryId: string } | { kind: 'manual'; addedBy?: string };
};

export type GroceryLine = {
  key: string;
  name: string;
  section: string;
  checked: boolean;
  itemIds: string[];
  amounts: Amount[];
  /** Meal entries the rows came from, in first-seen order. */
  entryIds: string[];
  /** Users who added rows by hand, in first-seen order. */
  addedBy: string[];
};

export function mergeRows(rows: GroceryRow[]): GroceryLine[] {
  const lines = new Map<string, GroceryLine & { raw: Amount[] }>();
  for (const row of rows) {
    const ingredientKey = row.ingredientId ?? `name:${normalizeName(row.name)}`;
    const key = `${row.checked ? 'checked' : 'open'}|${ingredientKey}`;
    let line = lines.get(key);
    if (line === undefined) {
      line = {
        key,
        name: row.name,
        section: row.section,
        checked: row.checked,
        itemIds: [],
        amounts: [],
        entryIds: [],
        addedBy: [],
        raw: [],
      };
      lines.set(key, line);
    }
    line.itemIds.push(row._id);
    line.raw.push({ qty: row.qty, unit: row.unit && isUnit(row.unit) ? row.unit : undefined });
    if (row.source.kind === 'meal') {
      if (!line.entryIds.includes(row.source.mealPlanEntryId)) {
        line.entryIds.push(row.source.mealPlanEntryId);
      }
    } else if (row.source.addedBy && !line.addedBy.includes(row.source.addedBy)) {
      line.addedBy.push(row.source.addedBy);
    }
  }
  return [...lines.values()]
    .map(({ raw, ...line }) => ({ ...line, amounts: sumAmounts(raw) }))
    .sort(
      (a, b) => sectionRank(a.section) - sectionRank(b.section) || a.name.localeCompare(b.name),
    );
}
