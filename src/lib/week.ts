/**
 * Calendar-date helpers. Dates are local calendar dates as "YYYY-MM-DD" strings in the
 * family's timezone (Architecture doc §4), so arithmetic is done in UTC on the date part only
 * and never shifts across DST.
 */

export type LocalDate = string;

/** 0 = Sunday, 1 = Monday, ... 6 = Saturday (same as Date#getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MONDAY: Weekday = 1;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(date: LocalDate): Date {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  const [, y, m, d] = match;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (utc.getUTCMonth() !== Number(m) - 1 || utc.getUTCDate() !== Number(d)) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return utc;
}

function fromUtc(utc: Date): LocalDate {
  return utc.toISOString().slice(0, 10);
}

export function isLocalDate(value: string): boolean {
  try {
    toUtc(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const utc = toUtc(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return fromUtc(utc);
}

export function weekday(date: LocalDate): Weekday {
  return toUtc(date).getUTCDay() as Weekday;
}

/** The calendar date "now" is in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function startOfWeek(date: LocalDate, weekStartsOn: Weekday = MONDAY): LocalDate {
  const offset = (weekday(date) - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export type WeekRange = { startDate: LocalDate; endDate: LocalDate };

export function weekRange(date: LocalDate, weekStartsOn: Weekday = MONDAY): WeekRange {
  const startDate = startOfWeek(date, weekStartsOn);
  return { startDate, endDate: addDays(startDate, 6) };
}

/**
 * The week the Groceries tab opens on. The family shops the weekend before the week, so from
 * the last three days of a week (Fri-Sun with a Monday start) it opens on next week's list.
 */
export function defaultGroceryWeek(today: LocalDate, weekStartsOn: Weekday = MONDAY): WeekRange {
  const current = weekRange(today, weekStartsOn);
  const daysIntoWeek = (weekday(today) - weekStartsOn + 7) % 7;
  return daysIntoWeek >= 4 ? weekRange(addDays(current.startDate, 7), weekStartsOn) : current;
}

/** ISO 8601 week number, as used on Norwegian calendars. */
export function isoWeekNumber(date: LocalDate): number {
  const utc = toUtc(date);
  const thursday = new Date(utc);
  thursday.setUTCDate(utc.getUTCDate() + 3 - ((utc.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}
