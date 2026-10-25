import { describe, expect, test } from 'vitest';

import en from '../../src/lib/i18n/locales/en.json';
import nb from '../../src/lib/i18n/locales/nb.json';
import {
  BUILT_IN_NAMES,
  cleanName,
  guessSection,
  normalizeName,
  SECTIONS,
  sectionRank,
} from './catalog';

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

test("the server's built-in section names match the app's", () => {
  for (const key of SECTIONS) {
    expect(BUILT_IN_NAMES[key]).toEqual([en.sections[key], nb.sections[key]]);
  }
});
