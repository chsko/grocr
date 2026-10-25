/**
 * Store sections and name handling for the family ingredient catalog (GRO-28). Every family starts
 * with the built-in sections below and can rename, delete, add and reorder them (GRO-51). The
 * section is first guessed from a small built-in word list in English and Norwegian, then jev
 * sorts it into the family's own sections (convex/classify.ts). "other" always exists.
 */

export const SECTIONS = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'dry',
  'frozen',
  'household',
  'other',
] as const;

export type Section = (typeof SECTIONS)[number];

export function isSection(value: string): value is Section {
  return (SECTIONS as readonly string[]).includes(value);
}

/**
 * One of a family's sections. Built-in sections keep their key ("dairy") and show the app's
 * translated label until the family gives them a `name`; the family's own sections always have one.
 */
export type FamilySection = { key: string; name?: string };

/**
 * The app's English and Norwegian names for the built-in sections, as in the locale files (a test
 * keeps them in step), so the server can refuse a new section named like one of them.
 */
export const BUILT_IN_NAMES: Record<Section, [string, string]> = {
  produce: ['Produce', 'Frukt og grønt'],
  meat: ['Meat & fish', 'Kjøtt og fisk'],
  dairy: ['Dairy & eggs', 'Meieri og egg'],
  bakery: ['Bakery', 'Bakeri'],
  dry: ['Dry goods', 'Tørrvarer'],
  frozen: ['Frozen', 'Frysevarer'],
  household: ['Household', 'Husholdning'],
  other: ['Other', 'Annet'],
};

/** Every name a section shows as: its own, or both translations of a built-in one. */
export function shownNames(section: FamilySection): string[] {
  if (section.name !== undefined) return [section.name];
  return isSection(section.key) ? BUILT_IN_NAMES[section.key] : [];
}

/** Most sections a family can have, and the longest section name. */
export const MAX_SECTIONS = 30;
export const MAX_SECTION_NAME = 40;

/**
 * The family's sections in store order. Families that never edited them get the built-in ones,
 * in the store order they set before GRO-51 (`sectionOrder`). "other" is always there.
 */
export function familySections(group: {
  sections?: readonly FamilySection[];
  sectionOrder?: readonly string[];
}): FamilySection[] {
  if (group.sections === undefined) return sectionOrder(group.sectionOrder).map((key) => ({ key }));
  const seen = new Set<string>();
  const sections = group.sections.filter((s) => !seen.has(s.key) && seen.add(s.key));
  return seen.has('other') ? sections : [...sections, { key: 'other' }];
}

/** The section to use for `section` in a family: itself if the family has it, else "other". */
export function placeSection(section: string, keys: readonly string[]): string {
  return keys.includes(section) ? section : 'other';
}

/**
 * The family's sections in the given order: the keys they gave, then any they left out (say, one
 * another member just added) in their current order. Unknown or repeated keys are dropped.
 */
export function reorderSections(
  sections: readonly FamilySection[],
  keys: readonly string[],
): FamilySection[] {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const picked = [...new Set(keys)].flatMap((k) => byKey.get(k) ?? []);
  return [...picked, ...sections.filter((s) => !picked.includes(s))];
}

/**
 * A built-in store order (before GRO-51): the sections in the order given, then any left out in
 * the default order. Unknown or repeated entries are dropped.
 */
export function sectionOrder(order?: readonly string[]): Section[] {
  const picked = [...new Set((order ?? []).filter(isSection))];
  return [...picked, ...SECTIONS.filter((s) => !picked.includes(s))];
}

/** Display order on the grocery list, by the family's store order when given. */
export function sectionRank(section: string, order: readonly string[] = SECTIONS): number {
  const index = order.indexOf(section);
  return index === -1 ? order.length : index;
}

/** Trims, collapses whitespace and capitalizes the first letter: "  red  onion" -> "Red onion". */
export function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

/** The key two names must share to be the same catalog ingredient. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

const KEYWORDS: Record<Exclude<Section, 'other'>, string[]> = {
  produce: [
    'onion',
    'løk',
    'garlic',
    'hvitløk',
    'tomato',
    'tomat',
    'potato',
    'potet',
    'carrot',
    'gulrot',
    'gulrøtter',
    'leek',
    'purre',
    'pepper',
    'paprika',
    'chili',
    'lettuce',
    'salat',
    'cucumber',
    'agurk',
    'avocado',
    'lime',
    'lemon',
    'sitron',
    'apple',
    'eple',
    'banana',
    'banan',
    'spinach',
    'spinat',
    'broccoli',
    'brokkoli',
    'cauliflower',
    'blomkål',
    'cabbage',
    'kål',
    'mushroom',
    'sopp',
    'herb',
    'basil',
    'basilikum',
    'parsley',
    'persille',
    'coriander',
    'koriander',
    'ginger',
    'ingefær',
    'zucchini',
    'squash',
    'celery',
    'selleri',
    'corn',
    'mais',
    'fruit',
    'frukt',
    'berries',
    'bær',
    'orange',
    'appelsin',
    'pear',
    'pære',
    'grape',
    'drue',
    'kale',
    'grønnkål',
    'sweet potato',
    'søtpotet',
    'beet',
    'rødbet',
    'pea',
    'erter',
    'bean sprout',
  ],
  meat: [
    'beef',
    'storfe',
    'mince',
    'kjøttdeig',
    'deig',
    'chicken',
    'kylling',
    'pork',
    'svin',
    'bacon',
    'ham',
    'skinke',
    'sausage',
    'pølse',
    'lamb',
    'lam',
    'salmon',
    'laks',
    'cod',
    'torsk',
    'fish',
    'fisk',
    'shrimp',
    'reker',
    'prawn',
    'tuna',
    'tunfisk',
    'steak',
    'biff',
    'meatball',
    'kjøttboller',
    'kjøttkaker',
    'turkey',
    'kalkun',
    'mackerel',
    'makrell',
    'sei',
    'pollock',
    'trout',
    'ørret',
    'filet',
    'fillet',
    'kjøtt',
    'meat',
  ],
  dairy: [
    'milk',
    'melk',
    'cream',
    'fløte',
    'cheese',
    'ost',
    'butter',
    'smør',
    'yogurt',
    'yoghurt',
    'sour cream',
    'rømme',
    'crème fraîche',
    'creme fraiche',
    'egg',
    'parmesan',
    'mozzarella',
    'feta',
    'cottage',
    'kesam',
    'kulturmelk',
    'margarin',
  ],
  bakery: [
    'bread',
    'brød',
    'tortilla',
    'lefse',
    'bun',
    'bolle',
    'baguette',
    'roll',
    'rundstykke',
    'pita',
    'naan',
    'knekkebrød',
    'crispbread',
    'polarbrød',
    'pizza base',
    'pizzabunn',
  ],
  dry: [
    'pasta',
    'spaghetti',
    'rice',
    'ris',
    'flour',
    'mel',
    'sugar',
    'sukker',
    'salt',
    'oil',
    'olje',
    'vinegar',
    'eddik',
    'lentil',
    'linser',
    'bean',
    'bønner',
    'chickpea',
    'kikerter',
    'stock',
    'buljong',
    'kraft',
    'spice',
    'krydder',
    'cumin',
    'spisskummen',
    'oregano',
    'cinnamon',
    'kanel',
    'curry',
    'soy',
    'soya',
    'sauce',
    'saus',
    'ketchup',
    'mustard',
    'sennep',
    'honey',
    'honning',
    'oats',
    'havre',
    'coffee',
    'kaffe',
    'tea',
    'te',
    'noodle',
    'nudler',
    'couscous',
    'bulgur',
    'quinoa',
    'nuts',
    'nøtter',
    'taco',
    'salsa',
    'coconut milk',
    'kokosmelk',
    'chopped tomatoes',
    'hakkede tomater',
    'tomato paste',
    'tomatpuré',
    'cereal',
    'frokostblanding',
    'baking powder',
    'bakepulver',
    'yeast',
    'gjær',
    'jam',
    'syltetøy',
  ],
  frozen: [
    'frozen',
    'frossen',
    'frosne',
    'fryst',
    'ice cream',
    'is',
    'fiskepinner',
    'fish fingers',
  ],
  household: [
    'soap',
    'såpe',
    'detergent',
    'vaskemiddel',
    'paper',
    'papir',
    'toilet',
    'toalett',
    'tissue',
    'foil',
    'folie',
    'bags',
    'poser',
    'sponge',
    'svamp',
    'diaper',
    'bleie',
    'shampoo',
    'toothpaste',
    'tannkrem',
    'batteri',
    'battery',
  ],
};

/**
 * Guesses the store section from an ingredient name. Frozen wins over the rest ("frozen peas" is frozen), then the
 * longest keyword wins ("chopped tomatoes" is dry goods, not produce).
 */
export function guessSection(name: string): Section {
  const text = ` ${normalizeName(name).replace(/[^\p{L}\p{N} ]/gu, ' ')} `;
  let best: { section: Section; length: number } | undefined;
  for (const [section, words] of Object.entries(KEYWORDS) as [Section, string[]][]) {
    for (const word of words) {
      // Short words must match whole ("is", "te"). Longer ones may end a Norwegian compound
      // ("rødløk", "kyllingfilet") and take an inflected tail ("onions", "løken").
      const pattern =
        word.length >= 3
          ? `[ ]\\p{L}*${escapeRegExp(word)}\\p{L}{0,3}[ ]`
          : `[ ]${escapeRegExp(word)}[ ]`;
      if (!new RegExp(pattern, 'u').test(text)) continue;
      if (section === 'frozen') return 'frozen';
      if (!best || word.length > best.length) best = { section, length: word.length };
    }
  }
  return best?.section ?? 'other';
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
