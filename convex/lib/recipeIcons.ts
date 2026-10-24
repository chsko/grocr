// Food icons a recipe can show in lists and on the week plan. Emoji, so they need no assets and
// render the same in Expo Go. Each has en + nb title keywords for guessing an icon for a recipe
// that hasn't picked one.

export const RECIPE_ICONS = [
  { icon: '🌮', words: ['taco', 'tacos', 'nachos', 'quesadilla'] },
  { icon: '🌯', words: ['burrito', 'wrap', 'wraps', 'fajita', 'fajitas'] },
  { icon: '🍕', words: ['pizza', 'calzone'] },
  {
    icon: '🍝',
    words: [
      'pasta',
      'spaghetti',
      'lasagne',
      'lasagna',
      'bolognese',
      'carbonara',
      'penne',
      'tagliatelle',
      'makaroni',
    ],
  },
  { icon: '🍜', words: ['nudler', 'noodles', 'ramen', 'pho', 'nudelsuppe'] },
  { icon: '🍲', words: ['suppe', 'soup', 'gryte', 'stew', 'lapskaus', 'chili', 'betasuppe'] },
  { icon: '🍛', words: ['curry', 'karri', 'tikka', 'masala', 'dal', 'korma'] },
  { icon: '🥘', words: ['paella', 'risotto', 'gryterett', 'frikassé', 'fårikål'] },
  { icon: '🍚', words: ['ris', 'rice', 'stekt ris', 'fried rice'] },
  { icon: '🍣', words: ['sushi', 'poke'] },
  { icon: '🍱', words: ['bento', 'teriyaki'] },
  { icon: '🥟', words: ['dumplings', 'gyoza', 'dumpling'] },
  { icon: '🍔', words: ['burger', 'hamburger', 'burgere'] },
  { icon: '🌭', words: ['pølse', 'pølser', 'hot dog', 'sausage', 'sausages'] },
  {
    icon: '🥩',
    words: ['biff', 'steak', 'entrecôte', 'indrefilet', 'svinekotelett', 'kotelett', 'ribbe'],
  },
  { icon: '🍗', words: ['kylling', 'chicken', 'kyllinglår', 'drumsticks'] },
  {
    icon: '🐟',
    words: [
      'fisk',
      'fish',
      'laks',
      'salmon',
      'torsk',
      'cod',
      'sei',
      'ørret',
      'fiskekaker',
      'fiskeboller',
    ],
  },
  { icon: '🍤', words: ['reker', 'shrimp', 'prawns', 'scampi'] },
  { icon: '🥗', words: ['salat', 'salad', 'bowl', 'buddha bowl'] },
  { icon: '🥙', words: ['kebab', 'pita', 'gyros', 'shawarma', 'falafel'] },
  { icon: '🥧', words: ['pai', 'pie', 'quiche', 'terte'] },
  { icon: '🍳', words: ['omelett', 'omelette', 'egg', 'eggs', 'frittata', 'shakshuka'] },
  { icon: '🥞', words: ['pannekaker', 'pannekake', 'pancakes', 'vafler', 'waffles'] },
  {
    icon: '🥔',
    words: [
      'potet',
      'poteter',
      'potato',
      'potatoes',
      'grateng',
      'gratin',
      'kjøttkaker',
      'kjøttboller',
      'meatballs',
    ],
  },
  { icon: '🍽️', words: [] },
] as const;

export type RecipeIcon = (typeof RECIPE_ICONS)[number]['icon'];

/** Shown when no keyword matches. */
export const DEFAULT_ICON: RecipeIcon = '🍽️';

const ICON_SET = new Set<string>(RECIPE_ICONS.map((i) => i.icon));

export function isRecipeIcon(value: unknown): value is RecipeIcon {
  return typeof value === 'string' && ICON_SET.has(value);
}

/**
 * An icon for a title: the first icon in list order with a matching keyword, else the plate.
 * Keywords of 4+ letters also match the end of a compound ("fredagstaco", "fiskesuppe").
 */
export function guessIcon(title: string): RecipeIcon {
  const words = title
    .normalize('NFC')
    .toLocaleLowerCase('nb')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const text = ` ${words.join(' ')} `;
  for (const { icon, words: keys } of RECIPE_ICONS) {
    const hit = keys.some((k) =>
      k.includes(' ')
        ? text.includes(` ${k} `)
        : words.some((w) => w === k || (k.length >= 4 && w.endsWith(k))),
    );
    if (hit) return icon;
  }
  return DEFAULT_ICON;
}

/** The recipe's chosen icon, or a guess from its title. */
export function recipeIcon(recipe: { icon?: string; title: string }): RecipeIcon {
  return isRecipeIcon(recipe.icon) ? recipe.icon : guessIcon(recipe.title);
}
