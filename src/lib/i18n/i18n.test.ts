import en from './locales/en.json';
import nb from './locales/nb.json';

import i18n, { pickLanguage } from '.';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const enKeys = flatten(en);
  const nbKeys = flatten(nb);

  test('Norwegian and English have the same keys', () => {
    expect(Object.keys(nbKeys).sort()).toEqual(Object.keys(enKeys).sort());
  });

  test('no empty strings', () => {
    for (const [key, value] of Object.entries({ ...enKeys, ...nbKeys })) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });

  test('both languages use the same placeholders', () => {
    for (const key of Object.keys(enKeys)) {
      expect({ key, vars: placeholders(nbKeys[key]) }).toEqual({
        key,
        vars: placeholders(enKeys[key]),
      });
    }
  });
});

describe('pickLanguage', () => {
  test.each([
    [['nb-NO'], 'nb'],
    [['no'], 'nb'],
    [['nn-NO'], 'nb'],
    [['en-GB'], 'en'],
    [['de-DE', 'nb-NO'], 'nb'],
    [['de-DE'], 'en'],
    [[null, undefined], 'en'],
  ])('%j -> %s', (codes, expected) => {
    expect(pickLanguage(codes)).toBe(expected);
  });
});
