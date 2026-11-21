import { describe, expect, test } from 'vitest';

import {
  cleanSectionName,
  groupBySection,
  keepStoredSections,
  MAX_SECTION_NAME,
  orderBySection,
} from './recipeSections';

describe('cleanSectionName', () => {
  test('trims, squeezes spaces and caps the length', () => {
    expect(cleanSectionName('  Hvit   saus ')).toBe('Hvit saus');
    expect(cleanSectionName('x'.repeat(60))).toHaveLength(MAX_SECTION_NAME);
  });

  test('blank or missing means no section', () => {
    expect(cleanSectionName('   ')).toBeUndefined();
    expect(cleanSectionName(undefined)).toBeUndefined();
  });

  test('the cap counts characters, so an emoji is never cut in half', () => {
    const name = cleanSectionName(`${'x'.repeat(39)}🍝🍝`)!;
    expect(Array.from(name)).toHaveLength(MAX_SECTION_NAME);
    expect(name.endsWith('🍝')).toBe(true);
  });

  test('hidden control characters are dropped', () => {
    expect(cleanSectionName('Saus\u0000​')).toBe('Saus');
  });
});

const line = (name: string, recipeSection?: string) => ({ name, recipeSection });

describe('orderBySection', () => {
  test('lines without a section come first, then each section together in first-seen order', () => {
    const ordered = orderBySection([
      line('Kjøttdeig', 'Kjøttsaus'),
      line('Melk', 'Hvit saus'),
      line('Lasagneplater'),
      line('Løk', 'Kjøttsaus'),
      line('Ost'),
    ]);
    expect(ordered.map((l) => [l.name, l.recipeSection])).toEqual([
      ['Lasagneplater', undefined],
      ['Ost', undefined],
      ['Kjøttdeig', 'Kjøttsaus'],
      ['Løk', 'Kjøttsaus'],
      ['Melk', 'Hvit saus'],
    ]);
  });

  test('names are cleaned, and one spelling (the first) wins regardless of case', () => {
    const ordered = orderBySection([
      line('Smør', ' Hvit saus '),
      line('Melk', 'HVIT SAUS'),
      line('Salt', '   '),
    ]);
    expect(ordered.map((l) => [l.name, l.recipeSection])).toEqual([
      ['Salt', undefined],
      ['Smør', 'Hvit saus'],
      ['Melk', 'Hvit saus'],
    ]);
  });

  test('a recipe without sections keeps its order untouched', () => {
    const lines = [line('B'), line('A'), line('C')];
    expect(orderBySection(lines).map((l) => l.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('groupBySection', () => {
  test('one group per section, with the unsectioned lines as a nameless first group', () => {
    const groups = groupBySection([line('Plater'), line('Melk', 'Saus'), line('Smør', 'Saus')]);
    expect(groups.map((g) => [g.name, g.lines.map((l) => l.name)])).toEqual([
      [null, ['Plater']],
      ['Saus', ['Melk', 'Smør']],
    ]);
  });

  test('no nameless group when every line has a section, and none at all for no lines', () => {
    expect(groupBySection([line('Melk', 'Saus')]).map((g) => g.name)).toEqual(['Saus']);
    expect(groupBySection([])).toEqual([]);
  });
});

describe('keepStoredSections', () => {
  test('an older app build sends no sections: each item keeps the section it had', () => {
    const stored = [
      { ingredientId: 'a', recipeSection: 'Saus' },
      { ingredientId: 'b', recipeSection: undefined },
    ];
    const sent = [{ ingredientId: 'b' }, { ingredientId: 'a' }, { ingredientId: 'c' }];
    expect(keepStoredSections(sent, stored)).toEqual([
      { ingredientId: 'b', recipeSection: undefined },
      { ingredientId: 'a', recipeSection: 'Saus' },
      { ingredientId: 'c', recipeSection: undefined },
    ]);
  });

  test('the same item in two sections keeps both, line by line', () => {
    const stored = [
      { ingredientId: 'butter', recipeSection: 'Roux' },
      { ingredientId: 'butter', recipeSection: 'Top' },
    ];
    const sent = [
      { ingredientId: 'butter' },
      { ingredientId: 'butter' },
      { ingredientId: 'butter' },
    ];
    expect(keepStoredSections(sent, stored).map((l) => l.recipeSection)).toEqual([
      'Roux',
      'Top',
      undefined,
    ]);
  });
});
