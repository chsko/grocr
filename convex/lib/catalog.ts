/**
 * Store sections and name handling for the family ingredient catalog (GRO-28). The section is
 * guessed from a small built-in word list in English and Norwegian; anything unknown goes to
 * "other". Smarter matching with jev is v1.1 (GRO-41).
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
 * A family's store order: their sections in the order they gave, then any they left out in the
 * default order. Unknown or repeated entries are dropped.
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
