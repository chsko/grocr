import { describe, expect, test } from 'vitest';

import { cleanName, guessSection, normalizeName, sectionRank } from './catalog';

describe('guessSection', () => {
  test.each([
    ['Onions', 'produce'],
    ['Rødløk', 'produce'],
    ['Hvitløk', 'produce'],
    ['Kyllingfilet', 'meat'],
    ['Minced beef', 'meat'],
    ['Melk', 'dairy'],
    ['Rømme', 'dairy'],
    ['Tortillas', 'bakery'],
    ['Chopped tomatoes', 'dry'],
    ['Hakkede tomater', 'dry'],
    ['Frozen peas', 'frozen'],
    ['Dish soap', 'household'],
    ['Isbergsalat', 'produce'],
    ['Zebra', 'other'],
  ])('%s -> %s', (name, section) => {
    expect(guessSection(name)).toBe(section);
  });
});

test('names are cleaned and normalized', () => {
  expect(cleanName('  red   onion ')).toBe('Red onion');
  expect(normalizeName(' Red  Onion')).toBe('red onion');
});

test('unknown sections sort last', () => {
  expect(sectionRank('produce')).toBe(0);
  expect(sectionRank('nope')).toBeGreaterThan(sectionRank('other'));
});
