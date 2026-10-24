/**
 * Units, scaling and merging for recipe ingredients and grocery lines (Product plan §5.4).
 *
 * Only metric mass (g/kg) and volume (ml/cl/dl/l) convert, and only within their own family.
 * Everything else (pieces, spoons, cans, ...) is summed only with the exact same unit and is
 * otherwise shown side by side. When in doubt, show unmerged rather than merge wrongly.
 */

export const UNITS = [
  'g',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'pcs',
  'tbsp',
  'tsp',
  'can',
  'pack',
  'clove',
  'slice',
  'bunch',
  'pinch',
] as const;

export type Unit = (typeof UNITS)[number];

const MASS: Partial<Record<Unit, number>> = { g: 1, kg: 1000 };
const VOLUME: Partial<Record<Unit, number>> = { ml: 1, cl: 10, dl: 100, l: 1000 };
/** Units that come in whole items, so a scaled amount rounds up to the next whole one. */
const WHOLE: ReadonlySet<Unit> = new Set(['pcs', 'clove', 'slice', 'bunch']);
/** Units that round up to the next quarter (half a can is a real thing). */
const QUARTERS: ReadonlySet<Unit> = new Set(['can', 'pack']);

/** Words people type for each unit, in English and Norwegian. */
const ALIASES: Record<string, Unit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  gr: 'g',
  kg: 'kg',
  kilo: 'kg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  liter: 'l',
  litre: 'l',
  pcs: 'pcs',
  pc: 'pcs',
  stk: 'pcs',
  st: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  tbsp: 'tbsp',
  ss: 'tbsp',
  spsk: 'tbsp',
  tsp: 'tsp',
  ts: 'tsp',
  tsk: 'tsp',
  can: 'can',
  cans: 'can',
  boks: 'can',
  bokser: 'can',
  pack: 'pack',
  pk: 'pack',
  pakke: 'pack',
  pakker: 'pack',
  clove: 'clove',
  cloves: 'clove',
  fedd: 'clove',
  slice: 'slice',
  slices: 'slice',
  skive: 'slice',
  skiver: 'slice',
  bunch: 'bunch',
  bunt: 'bunch',
  pinch: 'pinch',
  klype: 'pinch',
};

export function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value);
}

/** Maps what someone typed ("Stk", "dl", "boks") to a unit, or undefined if unknown. */
export function parseUnit(text: string | undefined): Unit | undefined {
  if (!text) return undefined;
  return ALIASES[text.trim().toLowerCase().replace(/\.$/, '')];
}

/** Parses "1,5", "1.5", "1/2" or "1 1/2" into a number; undefined for blank or invalid input. */
export function parseQty(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const s = text.trim().replace(',', '.');
  if (s === '') return undefined;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(s);
  if (fraction)
    return Number(fraction[2]) === 0 ? undefined : Number(fraction[1]) / Number(fraction[2]);
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function family(unit: Unit | undefined): 'mass' | 'volume' | undefined {
  if (unit === undefined) return undefined;
  if (MASS[unit] !== undefined) return 'mass';
  if (VOLUME[unit] !== undefined) return 'volume';
  return undefined;
}

/** Rounds a scaled amount to a sensible step for its unit. */
export function roundQty(qty: number, unit: Unit | undefined): number {
  if (unit !== undefined && WHOLE.has(unit)) return Math.max(1, Math.ceil(qty - 1e-9));
  if (unit === undefined) return Math.max(0.5, Math.ceil(qty * 2 - 1e-9) / 2);
  if (QUARTERS.has(unit)) return Math.max(0.25, Math.ceil(qty * 4 - 1e-9) / 4);
  if (unit === 'tbsp' || unit === 'tsp' || unit === 'pinch') {
    return Math.max(0.5, Math.round(qty * 2) / 2);
  }
  // Metric mass and volume.
  if (qty < 10) return Math.max(0.1, Math.round(qty * 10) / 10);
  if (qty < 100) return Math.round(qty);
  return Math.round(qty / 5) * 5;
}

/** Scales a recipe amount from the recipe's servings to the planned servings. */
export function scaleQty(
  qty: number | undefined,
  unit: Unit | undefined,
  fromServings: number,
  toServings: number,
): number | undefined {
  if (qty === undefined) return undefined;
  if (fromServings <= 0 || fromServings === toServings) return qty;
  return roundQty((qty * toServings) / fromServings, unit);
}

export type Amount = { qty?: number; unit?: Unit };

/**
 * Sums amounts of one ingredient. Mass and volume are summed within their family in base units
 * (g, ml); other units only with the exact same unit. Amounts without a quantity are kept once
 * as `{}` so "salt" + "salt" stays "salt". Returns the parts in a stable order.
 */
export function sumAmounts(amounts: Amount[]): Amount[] {
  const buckets = new Map<string, { qty: number; unit?: Unit; hasQty: boolean }>();
  for (const { qty, unit } of amounts) {
    const fam = family(unit);
    const key = fam ?? `unit:${unit ?? ''}`;
    const base = fam === 'mass' ? MASS[unit!]! : fam === 'volume' ? VOLUME[unit!]! : 1;
    const bucket = buckets.get(key) ?? {
      qty: 0,
      unit: fam === 'mass' ? 'g' : fam === 'volume' ? 'ml' : unit,
      hasQty: false,
    };
    if (qty !== undefined) {
      bucket.qty += qty * base;
      bucket.hasQty = true;
    }
    buckets.set(key, bucket);
  }
  const parts: Amount[] = [];
  for (const bucket of buckets.values()) {
    parts.push(
      bucket.hasQty ? niceUnit(bucket.qty, bucket.unit) : bucket.unit ? { unit: bucket.unit } : {},
    );
  }
  // Amounts with a quantity first, so "1 can + 200 g" reads naturally and bare names come last.
  return parts.sort((a, b) => Number(b.qty !== undefined) - Number(a.qty !== undefined));
}

/** Picks a readable unit for a summed base amount: 1500 g -> 1.5 kg, 500 ml -> 5 dl. */
function niceUnit(qty: number, unit: Unit | undefined): Amount {
  const clean = (n: number) => Math.round(n * 100) / 100;
  if (unit === 'g')
    return qty >= 1000 ? { qty: clean(qty / 1000), unit: 'kg' } : { qty: clean(qty), unit: 'g' };
  if (unit === 'ml') {
    if (qty >= 1000) return { qty: clean(qty / 1000), unit: 'l' };
    if (qty >= 100 && qty % 50 === 0) return { qty: clean(qty / 100), unit: 'dl' };
    return { qty: clean(qty), unit: 'ml' };
  }
  return { qty: clean(qty), unit };
}

/** Formats a number for display in the given language ("1,5" in Norwegian). */
export function formatQty(qty: number, language: string): string {
  const rounded = Math.round(qty * 100) / 100;
  const text = String(rounded);
  return language === 'nb' ? text.replace('.', ',') : text;
}
