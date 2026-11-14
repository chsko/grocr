import { describe, expect, test } from 'vitest';

import { christmasYear, giftCardShowing, isGiftCardStart, parsePrice } from './gifts';

describe('parsePrice', () => {
  test.each([
    ['', undefined],
    ['  ', undefined],
    ['300', 300],
    ['1 299,50', 1299.5],
    ['1299.50', 1299.5],
    ['kr 300', 300],
    ['300 kr', 300],
    ['300,-', 300],
    ['1.299', 1299],
    ['1.299,90', 1299.9],
    ['1,299', 1299],
    ['49,9', 49.9],
    ['NOK 2 000', 2000],
    ['-5', null],
    ['abc', null],
    ['1,2,3', null],
    ['12.345.6', null],
    ['99999999', null],
  ])('%j gives %j', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });
});

describe('gift card window', () => {
  test('start dates are real days up to Christmas Eve', () => {
    expect(isGiftCardStart('11-01')).toBe(true);
    expect(isGiftCardStart('01-31')).toBe(true);
    expect(isGiftCardStart('12-24')).toBe(true);
    expect(isGiftCardStart('12-25')).toBe(false);
    expect(isGiftCardStart('02-29')).toBe(false);
    expect(isGiftCardStart('04-31')).toBe(false);
    expect(isGiftCardStart('1-01')).toBe(false);
  });

  test('shows from the start day through Christmas Eve', () => {
    expect(giftCardShowing('2026-10-31')).toBe(false);
    expect(giftCardShowing('2026-11-01')).toBe(true);
    expect(giftCardShowing('2026-12-24')).toBe(true);
    expect(giftCardShowing('2026-12-25')).toBe(false);
    expect(giftCardShowing('2026-09-15', '09-15')).toBe(true);
  });

  test('the Christmas being planned is this year’s', () => {
    expect(christmasYear('2026-12-31')).toBe(2026);
    expect(christmasYear('2027-01-01')).toBe(2027);
  });
});
