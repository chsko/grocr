import { describe, expect, test } from 'vitest';

import { formatQty, parseQty, parseUnit, roundQty, scaleQty, sumAmounts } from './units';

describe('parseUnit', () => {
  test.each([
    ['stk', 'pcs'],
    ['Stk.', 'pcs'],
    ['ss', 'tbsp'],
    ['ts', 'tsp'],
    ['boks', 'can'],
    ['DL', 'dl'],
    ['fedd', 'clove'],
    ['', undefined],
    ['handful', undefined],
  ])('%s -> %s', (text, unit) => {
    expect(parseUnit(text)).toBe(unit);
  });
});

describe('parseQty', () => {
  test.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['400', 400],
    ['', undefined],
    ['0', undefined],
    ['-2', undefined],
    ['abc', undefined],
    ['1/0', undefined],
  ])('%s -> %s', (text, qty) => {
    expect(parseQty(text)).toBe(qty);
  });
});

describe('scaling', () => {
  test('whole items round up', () => {
    expect(scaleQty(3, 'pcs', 4, 6)).toBe(5);
    expect(scaleQty(1, 'clove', 4, 2)).toBe(1);
  });
  test('cans round up to quarters', () => {
    expect(scaleQty(1, 'can', 4, 6)).toBe(1.5);
    expect(scaleQty(1, 'can', 4, 5)).toBe(1.25);
  });
  test('metric amounts round to sensible steps', () => {
    expect(scaleQty(400, 'g', 4, 6)).toBe(600);
    expect(scaleQty(333, 'g', 3, 2)).toBe(220);
    expect(scaleQty(3, 'dl', 4, 6)).toBe(4.5);
    expect(roundQty(47.4, 'g')).toBe(47);
  });
  test('same servings or no amount leaves it alone', () => {
    expect(scaleQty(2, 'pcs', 4, 4)).toBe(2);
    expect(scaleQty(undefined, 'pcs', 4, 8)).toBeUndefined();
  });
});

describe('sumAmounts', () => {
  test('same unit sums', () => {
    expect(
      sumAmounts([
        { qty: 2, unit: 'pcs' },
        { qty: 1, unit: 'pcs' },
      ]),
    ).toEqual([{ qty: 3, unit: 'pcs' }]);
  });
  test('volume converts within its family', () => {
    expect(
      sumAmounts([
        { qty: 2, unit: 'dl' },
        { qty: 300, unit: 'ml' },
      ]),
    ).toEqual([{ qty: 5, unit: 'dl' }]);
    expect(
      sumAmounts([
        { qty: 7, unit: 'dl' },
        { qty: 0.5, unit: 'l' },
      ]),
    ).toEqual([{ qty: 1.2, unit: 'l' }]);
  });
  test('mass converts within its family', () => {
    expect(
      sumAmounts([
        { qty: 500, unit: 'g' },
        { qty: 1, unit: 'kg' },
      ]),
    ).toEqual([{ qty: 1.5, unit: 'kg' }]);
  });
  test('different families stay side by side', () => {
    expect(
      sumAmounts([
        { qty: 1, unit: 'can' },
        { qty: 200, unit: 'g' },
      ]),
    ).toEqual([
      { qty: 1, unit: 'can' },
      { qty: 200, unit: 'g' },
    ]);
  });
  test('amounts without a quantity collapse into the counted ones', () => {
    expect(sumAmounts([{}, {}])).toEqual([{}]);
    expect(sumAmounts([{}, { qty: 2 }])).toEqual([{ qty: 2 }]);
    expect(sumAmounts([{ unit: 'tsp' }, { qty: 200, unit: 'g' }])).toEqual([
      { qty: 200, unit: 'g' },
      { unit: 'tsp' },
    ]);
  });
});

test('formatQty uses a decimal comma in Norwegian', () => {
  expect(formatQty(1.5, 'nb')).toBe('1,5');
  expect(formatQty(1.5, 'en')).toBe('1.5');
});
