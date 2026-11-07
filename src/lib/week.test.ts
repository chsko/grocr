import {
  addDays,
  defaultGroceryWeek,
  isLocalDate,
  isoWeekNumber,
  startOfWeek,
  todayIn,
  realignedWeekStart,
  weekNumber,
  weekRange,
  weeksBetween,
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

describe('week start day (GRO-72)', () => {
  test('a list moves to the new week that covers most of its days', () => {
    // Monday 2026-11-02 week: Sunday start -> Sunday before; Saturday start -> Saturday before.
    expect(realignedWeekStart('2026-11-02', 0)).toBe('2026-11-01');
    expect(realignedWeekStart('2026-11-02', 6)).toBe('2026-10-31');
    expect(realignedWeekStart('2026-11-02', 4)).toBe('2026-11-05');
    expect(realignedWeekStart('2026-11-02', 1)).toBe('2026-11-02');
    // Distinct weeks never collide.
    const starts = [0, 7, 14].map((d) => realignedWeekStart(addDays('2026-11-02', d), 3));
    expect(new Set(starts).size).toBe(3);
  });

  test('the shopping week turns over in the last three days, whatever the start day', () => {
    // Sunday start: Thu-Sat open next week.
    expect(defaultGroceryWeek('2026-11-04', 0).startDate).toBe('2026-11-01'); // Wed
    expect(defaultGroceryWeek('2026-11-05', 0).startDate).toBe('2026-11-08'); // Thu
    expect(defaultGroceryWeek('2026-11-07', 0).startDate).toBe('2026-11-08'); // Sat
  });

  test('weeksBetween counts whole weeks either way', () => {
    expect(weeksBetween('2026-11-02', '2026-11-16')).toBe(2);
    expect(weeksBetween('2026-11-02', '2026-10-19')).toBe(-2);
    expect(weeksBetween('2026-10-19', '2026-11-02')).toBe(2); // across the DST change
  });

  test('the week number is the one most of the week is in', () => {
    // Sunday 2026-11-01 is ISO week 44, but Mon-Sat after it are week 45.
    expect(weekNumber('2026-11-01')).toBe(45);
    expect(weekNumber('2026-11-02')).toBe(45);
  });
});
