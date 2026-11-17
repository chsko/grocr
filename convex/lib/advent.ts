/**
 * Advent calendars (#88), pure rules shared by the server and the app: which days a calendar
 * can have, the day templates, how doors are numbered, and what the Week card shows.
 * Days are local dates ("YYYY-MM-DD") in the family's timezone.
 */

import { addDays, isLocalDate, weekday, type LocalDate } from './week';

/** Most days, recipients and calendars, so one family can't grow a calendar without end. */
export const MAX_RECIPIENTS = 10;
export const MAX_CALENDARS = 30;

export type AdventTemplate = 'december' | 'sundays' | 'own';

export const ADVENT_TEMPLATES: readonly AdventTemplate[] = ['december', 'sundays', 'own'];

/** The first Sunday in Advent: the Sunday from 27 November to 3 December. */
export function firstAdventSunday(year: number): LocalDate {
  const third = `${year}-12-03`;
  return addDays(third, -weekday(third));
}

export function christmasEve(year: number): LocalDate {
  return `${year}-12-24`;
}

/**
 * The first day a calendar of `year` may have: the first Sunday in Advent, or 1 December when
 * Advent starts later (2028: 3 December), so a 1-24 December calendar always fits.
 */
export function firstAllowedDay(year: number): LocalDate {
  const sunday = firstAdventSunday(year);
  const december = `${year}-12-01`;
  return sunday < december ? sunday : december;
}

/** Every day a calendar of `year` may have: first Sunday in Advent (or 1 Dec) to Christmas Eve. */
export function allowedDays(year: number): LocalDate[] {
  const days: LocalDate[] = [];
  const last = christmasEve(year);
  for (let day = firstAllowedDay(year); day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The days a new calendar starts with. */
export function templateDays(year: number, template: AdventTemplate): LocalDate[] {
  const all = allowedDays(year);
  if (template === 'december') return all.filter((d) => d >= `${year}-12-01`);
  if (template === 'sundays') {
    return all.filter((d) => d >= firstAdventSunday(year) && weekday(d) === 0);
  }
  return [];
}

/** The template a day list matches, or null when the days were picked by hand. */
export function matchingTemplate(year: number, days: readonly LocalDate[]): AdventTemplate | null {
  for (const template of ['december', 'sundays'] as const) {
    const wanted = templateDays(year, template);
    if (wanted.length === days.length && wanted.every((d, i) => d === days[i])) return template;
  }
  return null;
}

/**
 * A calendar's days sorted and without repeats, or null when one is not a day of that year's
 * Advent or there are none.
 */
export function cleanDays(year: number, days: readonly string[]): LocalDate[] | null {
  const first = firstAllowedDay(year);
  const last = christmasEve(year);
  const unique = [...new Set(days)].sort();
  if (unique.length === 0) return null;
  for (const day of unique) {
    if (!isLocalDate(day) || day < first || day > last) return null;
  }
  return unique;
}

/** Whether a calendar's days are exactly 1 to 24 December, so doors carry their date. */
export function isFullDecember(year: number, days: readonly LocalDate[]) {
  return matchingTemplate(year, days) === 'december';
}

/**
 * The number on a door: its date for a 1-24 December calendar, else its place in the
 * calendar (the third Sunday is door 3).
 */
export function doorNumber(year: number, days: readonly LocalDate[], day: LocalDate): number {
  if (isFullDecember(year, days)) return Number(day.slice(8));
  return days.indexOf(day) + 1;
}

/** Short calendars get big doors in two columns; long ones a grid of six. */
export function bigDoors(days: readonly LocalDate[]) {
  return days.length <= 8;
}

/**
 * What the Week card shows for one calendar on `today`: today's and tomorrow's door when the
 * calendar has them, else the next door. It starts the day before the first door, so that
 * door gets its reminder too. Null before that and after the last door, so the card leaves the
 * calendar out.
 */
export function cardDoors(
  days: readonly LocalDate[],
  today: LocalDate,
): { today: LocalDate | null; tomorrow: LocalDate | null; next: LocalDate | null } | null {
  if (days.length === 0) return null;
  if (today < addDays(days[0], -1) || today > days[days.length - 1]) return null;
  const tomorrow = addDays(today, 1);
  const hasToday = days.includes(today);
  const hasTomorrow = days.includes(tomorrow);
  if (hasToday || hasTomorrow) {
    return { today: hasToday ? today : null, tomorrow: hasTomorrow ? tomorrow : null, next: null };
  }
  return { today: null, tomorrow: null, next: days.find((d) => d > today) ?? null };
}
