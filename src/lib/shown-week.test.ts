import { pickShownWeek, weekKind } from './shown-week';

// Monday weeks: 2026-11-02 (week 45) and 2026-11-09 (week 46).
const remembered = (
  startDate: string,
  thisWeek: string,
  shoppingWeek: string,
  weekStartsOn = 1,
) => ({
  startDate,
  thisWeek,
  shoppingWeek,
  weekStartsOn,
  groupId: 'g1',
});

describe('the remembered week (GRO-72)', () => {
  test('opens on the shopping week when nothing is remembered', () => {
    expect(pickShownWeek(null, '2026-11-03', 1, 'g1').startDate).toBe('2026-11-02');
    expect(pickShownWeek(null, '2026-11-06', 1, 'g1').startDate).toBe('2026-11-09'); // Friday
  });

  test('reopens the remembered week while this week and the shopping week stay put', () => {
    const saved = remembered('2026-11-23', '2026-11-02', '2026-11-02');
    expect(pickShownWeek(saved, '2026-11-05', 1, 'g1').startDate).toBe('2026-11-23');
  });

  test('goes back to the shopping week once it moves on Friday', () => {
    const saved = remembered('2026-10-26', '2026-11-02', '2026-11-02');
    expect(pickShownWeek(saved, '2026-11-06', 1, 'g1').startDate).toBe('2026-11-09');
  });

  test('goes back once a new week starts, even if the shopping week did not move', () => {
    // Picked on Sunday (shopping week already next week), opened again on Monday.
    const saved = remembered('2026-11-23', '2026-11-02', '2026-11-09');
    expect(pickShownWeek(saved, '2026-11-09', 1, 'g1').startDate).toBe('2026-11-09');
  });

  test('forgets a week from before the family changed its start day', () => {
    const saved = remembered('2026-11-23', '2026-11-01', '2026-11-01', 0);
    expect(pickShownWeek(saved, '2026-11-03', 1, 'g1').startDate).toBe('2026-11-02');
  });

  test('never opens on a week picked in another family', () => {
    const saved = { ...remembered('2026-11-23', '2026-11-02', '2026-11-02'), groupId: 'g0' };
    expect(pickShownWeek(saved, '2026-11-05', 1, 'g1').startDate).toBe('2026-11-02');
  });

  test('tells past, this and future weeks apart', () => {
    expect(weekKind('2026-10-26', '2026-11-02')).toBe('past');
    expect(weekKind('2026-11-02', '2026-11-02')).toBe('this');
    expect(weekKind('2026-11-09', '2026-11-02')).toBe('future');
  });
});
