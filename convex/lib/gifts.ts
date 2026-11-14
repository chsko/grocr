/**
 * Christmas gifts (#78), pure rules shared by the server and the app: prices, when the Week
 * card shows, and which Christmas "now" is.
 */

import type { LocalDate } from './week';

export type GiftStatus = 'idea' | 'bought' | 'wrapped';

export const GIFT_STATUSES: readonly GiftStatus[] = ['idea', 'bought', 'wrapped'];

/** The Week card shows from 1 November unless the family picks another day. */
export const DEFAULT_GIFT_CARD_START = '11-01';

/** The card stops showing after Christmas Eve. */
export const GIFT_CARD_END = '12-24';

export const MAX_GIFT_PRICE = 10_000_000;
export const MIN_GIFT_YEAR = 2000;
export const MAX_GIFT_YEAR = 2100;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A valid "MM-DD" start for the Week card, on or before Christmas Eve (no 29 February). */
export function isGiftCardStart(value: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return false;
  return value <= GIFT_CARD_END;
}

export function daysInMonth(month: number): number {
  return DAYS_IN_MONTH[month - 1] ?? 31;
}

/** Whether the Christmas gifts card shows on Week today. */
export function giftCardShowing(today: LocalDate, start: string = DEFAULT_GIFT_CARD_START) {
  const monthDay = today.slice(5);
  return monthDay >= start && monthDay <= GIFT_CARD_END;
}

/** The Christmas a family is planning on `today`: this year's, until New Year. */
export function christmasYear(today: LocalDate): number {
  return Number(today.slice(0, 4));
}

/** Bought and wrapped gifts count as spent; ideas only as planned. */
export function isSpent(status: GiftStatus) {
  return status !== 'idea';
}

/** Rounds a price to øre, or returns null when it can't be one. */
export function cleanPrice(price: number): number | null {
  if (!Number.isFinite(price) || price < 0 || price > MAX_GIFT_PRICE) return null;
  return Math.round(price * 100) / 100;
}

/**
 * A price from what a member typed: undefined for nothing, null when it isn't a price.
 * Accepts "1 299,50", "1299.50", "kr 300", "300 kr", "300,-" and "1.299" (thousands dot).
 */
export function parsePrice(input: string): number | null | undefined {
  let text = input
    .trim()
    .toLowerCase()
    .replace(/^(kr\.?|nok)\s*/, '')
    .replace(/\s*(kr\.?|nok|,-|,–)$/, '')
    .replace(/[\s  ']/g, '');
  if (text === '') return undefined;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) {
    // 1.299 or 1.299,50: dots group thousands.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) {
    // 1,299 or 1,299.50: commas group thousands.
    text = text.replace(/,/g, '');
  } else {
    text = text.replace(',', '.');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return cleanPrice(Number(text));
}
