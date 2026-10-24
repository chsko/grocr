import {
  addDays,
  defaultGroceryWeek,
  isLocalDate,
  isoWeekNumber,
  startOfWeek,
  todayIn,
  weekRange,
} from './week';

describe('week helpers', () => {
  test('addDays crosses month, year and DST boundaries without shifting', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    // Norway leaves summer time on 2026-10-25.
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  test('weeks start on Monday by default', () => {
    expect(startOfWeek('2026-10-24')).toBe('2026-10-19'); // Saturday
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26'); // Monday
    expect(weekRange('2026-10-28')).toEqual({ startDate: '2026-10-26', endDate: '2026-11-01' });
  });

  test('weeks can start on another day', () => {
    expect(startOfWeek('2026-10-24', 0)).toBe('2026-10-18');
  });

  test.each([
    ['2026-10-26', '2026-10-26'], // Monday: this week
    ['2026-10-29', '2026-10-26'], // Thursday: this week
    ['2026-10-30', '2026-11-02'], // Friday: next week
    ['2026-10-31', '2026-11-02'], // Saturday: next week
    ['2026-11-01', '2026-11-02'], // Sunday: next week
  ])('Groceries on %s opens the week of %s', (today, start) => {
    expect(defaultGroceryWeek(today).startDate).toBe(start);
  });

  test('todayIn uses the family timezone, not the device clock', () => {
    const lateEveningUtc = new Date('2026-10-24T23:30:00Z');
    expect(todayIn('Europe/Oslo', lateEveningUtc)).toBe('2026-10-25');
    expect(todayIn('America/New_York', lateEveningUtc)).toBe('2026-10-24');
  });

  test('ISO week numbers', () => {
    expect(isoWeekNumber('2026-10-24')).toBe(43);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2027-01-04')).toBe(1);
  });

  test('rejects malformed and impossible dates', () => {
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('26-10-24')).toBe(false);
    expect(isLocalDate('2026-10-24')).toBe(true);
    expect(() => addDays('nope', 1)).toThrow();
  });
});
