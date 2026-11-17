import { describe, expect, test } from 'vitest';

import {
  allowedDays,
  bigDoors,
  cardDoors,
  cleanDays,
  doorNumber,
  firstAdventSunday,
  matchingTemplate,
  templateDays,
} from './advent';

describe('first Sunday in Advent', () => {
  test.each([
    [2026, '2026-11-29'],
    [2027, '2027-11-28'],
    [2022, '2022-11-27'], // earliest possible
    [2023, '2023-12-03'], // latest possible
    [2028, '2028-12-03'],
  ])('%i is %s', (year, day) => {
    expect(firstAdventSunday(year)).toBe(day);
  });

  test('allowed days run from it to Christmas Eve', () => {
    const days = allowedDays(2026);
    expect(days[0]).toBe('2026-11-29');
    expect(days[days.length - 1]).toBe('2026-12-24');
    expect(days).toHaveLength(26);
  });

  test('a 1-24 December calendar fits even when Advent starts on 3 December', () => {
    expect(allowedDays(2028)[0]).toBe('2028-12-01');
    const december = templateDays(2028, 'december');
    expect(december).toHaveLength(24);
    expect(december[0]).toBe('2028-12-01');
    expect(templateDays(2028, 'sundays')[0]).toBe('2028-12-03');
    expect(doorNumber(2028, december, '2028-12-03')).toBe(3);
  });
});

describe('templates', () => {
  test('1-24 December', () => {
    const days = templateDays(2026, 'december');
    expect(days).toHaveLength(24);
    expect(days[0]).toBe('2026-12-01');
    expect(days[days.length - 1]).toBe('2026-12-24');
  });

  test('the Advent Sundays, also when the fourth is Christmas Eve', () => {
    expect(templateDays(2026, 'sundays')).toEqual([
      '2026-11-29',
      '2026-12-06',
      '2026-12-13',
      '2026-12-20',
    ]);
    expect(templateDays(2023, 'sundays')).toEqual([
      '2023-12-03',
      '2023-12-10',
      '2023-12-17',
      '2023-12-24',
    ]);
  });

  test('own days start empty', () => {
    expect(templateDays(2026, 'own')).toEqual([]);
  });

  test('a day list is matched back to its template', () => {
    expect(matchingTemplate(2026, templateDays(2026, 'december'))).toBe('december');
    expect(matchingTemplate(2026, templateDays(2026, 'sundays'))).toBe('sundays');
    expect(matchingTemplate(2026, ['2026-12-06'])).toBeNull();
  });
});

describe('cleaning days', () => {
  test('sorts and drops repeats', () => {
    expect(cleanDays(2026, ['2026-12-06', '2026-11-29', '2026-12-06'])).toEqual([
      '2026-11-29',
      '2026-12-06',
    ]);
  });

  test('refuses days outside that Advent, bad dates and an empty list', () => {
    expect(cleanDays(2026, ['2026-11-28'])).toBeNull();
    expect(cleanDays(2026, ['2026-12-25'])).toBeNull();
    expect(cleanDays(2026, ['2027-12-01'])).toBeNull();
    expect(cleanDays(2026, ['2026-12-32'])).toBeNull();
    expect(cleanDays(2026, ['12-01'])).toBeNull();
    expect(cleanDays(2026, [])).toBeNull();
  });
});

describe('door numbers', () => {
  test('a 1-24 December calendar numbers doors by date', () => {
    const days = templateDays(2026, 'december');
    expect(doorNumber(2026, days, '2026-12-13')).toBe(13);
  });

  test('other calendars number doors by place', () => {
    const sundays = templateDays(2026, 'sundays');
    expect(doorNumber(2026, sundays, '2026-12-13')).toBe(3);
    const fromNovember = [...allowedDays(2026)].slice(0, 24);
    expect(doorNumber(2026, fromNovember, '2026-12-01')).toBe(3);
  });

  test('short calendars get big doors', () => {
    expect(bigDoors(templateDays(2026, 'sundays'))).toBe(true);
    expect(bigDoors(templateDays(2026, 'december'))).toBe(false);
  });
});

describe('the Week card', () => {
  const december = templateDays(2026, 'december');
  const sundays = templateDays(2026, 'sundays');

  test('shows today and tomorrow when the calendar has them', () => {
    expect(cardDoors(december, '2026-12-04')).toEqual({
      today: '2026-12-04',
      tomorrow: '2026-12-05',
      next: null,
    });
  });

  test('starts the day before the first door', () => {
    expect(cardDoors(december, '2026-11-29')).toBeNull();
    expect(cardDoors(december, '2026-11-30')).toEqual({
      today: null,
      tomorrow: '2026-12-01',
      next: null,
    });
  });

  test('on Christmas Eve only today', () => {
    expect(cardDoors(december, '2026-12-24')).toEqual({
      today: '2026-12-24',
      tomorrow: null,
      next: null,
    });
    expect(cardDoors(december, '2026-12-25')).toBeNull();
  });

  test('between Sundays it shows the next door', () => {
    expect(cardDoors(sundays, '2026-12-02')).toEqual({
      today: null,
      tomorrow: null,
      next: '2026-12-06',
    });
    expect(cardDoors(sundays, '2026-12-05')).toEqual({
      today: null,
      tomorrow: '2026-12-06',
      next: null,
    });
    expect(cardDoors(sundays, '2026-12-21')).toBeNull();
  });
});
