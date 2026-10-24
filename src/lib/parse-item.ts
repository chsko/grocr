import { parseQty, parseUnit, type Unit } from '@/convex/lib/units';

/**
 * Reads what someone types into "Add an item": "2 l melk" -> 2 l of "melk", "3 onions" -> 3 of
 * "onions", "coffee" -> just "coffee". A leading number only counts when a name follows it.
 */
export function parseItemInput(text: string): { name: string; qty?: number; unit?: Unit } {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const match = /^(\d+(?:[.,]\d+)?|\d+\/\d+)(\s*)(\S+)?\s*(.*)$/.exec(trimmed);
  if (!match) return { name: trimmed };
  const [, qtyText, space, second = '', rest] = match;
  const qty = parseQty(qtyText);
  if (qty === undefined) return { name: trimmed };
  const unit = parseUnit(second);
  if (unit !== undefined) return rest ? { name: rest, qty, unit } : { name: trimmed };
  // "7up" is a name; only a unit may stick to the number ("500g").
  if (space === '') return { name: trimmed };
  const name = [second, rest].filter(Boolean).join(' ');
  return name ? { name, qty } : { name: trimmed };
}
