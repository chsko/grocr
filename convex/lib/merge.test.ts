import { expect, test } from 'vitest';

import { mergeRows, type GroceryRow } from './merge';

const row = (over: Partial<GroceryRow> & { _id: string }): GroceryRow => ({
  ingredientId: 'onion',
  name: 'Onion',
  section: 'produce',
  checked: false,
  source: { kind: 'manual' },
  ...over,
});

test('rows of one ingredient merge with all their sources', () => {
  const lines = mergeRows([
    row({ _id: '1', qty: 2, unit: 'pcs', source: { kind: 'meal', mealPlanEntryId: 'tacos' } }),
    row({ _id: '2', qty: 1, unit: 'pcs', source: { kind: 'meal', mealPlanEntryId: 'soup' } }),
    row({ _id: '3', qty: 1, unit: 'pcs', source: { kind: 'manual', addedBy: 'ola' } }),
  ]);
  expect(lines).toEqual([
    {
      key: 'open|onion',
      ingredientId: 'onion',
      name: 'Onion',
      section: 'produce',
      checked: false,
      atHome: false,
      itemIds: ['1', '2', '3'],
      amounts: [{ qty: 4, unit: 'pcs' }],
      entryIds: ['tacos', 'soup'],
      addedBy: ['ola'],
    },
  ]);
});

test('open and checked rows stay apart; lines sort by section then name', () => {
  const lines = mergeRows([
    row({ _id: '1', ingredientId: 'milk', name: 'Milk', section: 'dairy', qty: 2, unit: 'dl' }),
    row({ _id: '2', ingredientId: 'milk', name: 'Milk', section: 'dairy', qty: 300, unit: 'ml' }),
    row({ _id: '3', qty: 1, unit: 'pcs', checked: true }),
    row({ _id: '4', qty: 2, unit: 'pcs' }),
    row({ _id: '5', ingredientId: null, name: 'apples', qty: 1, unit: 'pcs' }),
    row({ _id: '6', ingredientId: null, name: 'Apples ', qty: 2, unit: 'pcs' }),
  ]);
  expect(lines.map((l) => [l.name, l.checked, l.amounts])).toEqual([
    ['apples', false, [{ qty: 3, unit: 'pcs' }]],
    ['Onion', true, [{ qty: 1, unit: 'pcs' }]],
    ['Onion', false, [{ qty: 2, unit: 'pcs' }]],
    ['Milk', false, [{ qty: 5, unit: 'dl' }]],
  ]);
});

test('lines follow a family store order', () => {
  const row = (id: string, name: string, section: string) => ({
    _id: id,
    ingredientId: id,
    name,
    section,
    checked: false,
    source: { kind: 'manual' as const },
  });
  const rows = [row('a', 'Milk', 'dairy'), row('b', 'Apples', 'produce')];
  expect(mergeRows(rows).map((l) => l.name)).toEqual(['Apples', 'Milk']);
  expect(mergeRows(rows, ['dairy', 'produce']).map((l) => l.name)).toEqual(['Milk', 'Apples']);
});

test('rows someone has at home merge on their own line', () => {
  const lines = mergeRows([
    row({ _id: '1', qty: 2, unit: 'pcs', atHome: true }),
    row({ _id: '2', qty: 1, unit: 'pcs' }),
    row({ _id: '3', qty: 1, unit: 'pcs', atHome: true }),
  ]);
  expect(lines.map((l) => [l.key, l.atHome, l.itemIds, l.amounts])).toEqual([
    ['home|onion', true, ['1', '3'], [{ qty: 3, unit: 'pcs' }]],
    ['open|onion', false, ['2'], [{ qty: 1, unit: 'pcs' }]],
  ]);
});
