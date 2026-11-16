import { matchesSearch } from './search';

describe('matchesSearch', () => {
  test('ignores case and accents but keeps the Norwegian letters', () => {
    expect(matchesSearch('rene', 'René')).toBe(true);
    expect(matchesSearch('BESTE', 'Besteforeldre')).toBe(true);
    expect(matchesSearch('å', 'Åse')).toBe(true);
    expect(matchesSearch('a', 'Åse')).toBe(false);
    expect(matchesSearch('bjø', 'Bjørn')).toBe(true);
  });

  test('matches if any text matches, and everything when empty', () => {
    expect(matchesSearch('fam', 'Ola', 'Familien Hansen')).toBe(true);
    expect(matchesSearch('kari', 'Ola', null)).toBe(false);
    expect(matchesSearch('  ', 'Ola')).toBe(true);
  });
});
