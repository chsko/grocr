import { describe, expect, test } from 'vitest';

import { MAX_RECIPE_URL, normalizeRecipeUrl, recipeSite } from './recipeLink';

describe('normalizeRecipeUrl', () => {
  test('keeps web links and adds https:// when the scheme is missing', () => {
    expect(normalizeRecipeUrl('  https://www.matprat.no/oppskrifter/tacos/  ')).toBe(
      'https://www.matprat.no/oppskrifter/tacos/',
    );
    expect(normalizeRecipeUrl('HTTP://example.com/A?b=1#c')).toBe('http://example.com/A?b=1#c');
    expect(normalizeRecipeUrl('matprat.no/oppskrifter/tacos')).toBe(
      'https://matprat.no/oppskrifter/tacos',
    );
    expect(normalizeRecipeUrl('//example.com/x')).toBe('https://example.com/x');
    expect(normalizeRecipeUrl('localhost.test:8080/x')).toBe('https://localhost.test:8080/x');
    expect(normalizeRecipeUrl('blåbær.no/pai')).toBe('https://blåbær.no/pai');
    expect(normalizeRecipeUrl('https://matprat.no./x')).toBe('https://matprat.no./x');
    expect(normalizeRecipeUrl('ndla.no/nb/subject:1/topic:2')).toBe(
      'https://ndla.no/nb/subject:1/topic:2',
    );
  });

  test('takes the one link out of pasted share text', () => {
    expect(normalizeRecipeUrl('Tacos | MatPrat https://www.matprat.no/tacos/')).toBe(
      'https://www.matprat.no/tacos/',
    );
    expect(normalizeRecipeUrl('https://a.no/x https://b.no/y')).toBeNull();
  });

  test('blank means no link', () => {
    expect(normalizeRecipeUrl('')).toBe('');
    expect(normalizeRecipeUrl('   ')).toBe('');
  });

  test('refuses anything that is not a web page', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'mailto:kari@example.no',
      'data:text/html,hi',
      'file:///etc/passwd',
      'intent://x#Intent;end',
      'ftp://example.com/x',
      'https://evil.com@matprat.no/x',
      'https://user:pw@matprat.no',
      'https:///x',
      'https://nodot/x',
      'tacos',
      'matprat .no',
      'https://a..no',
      'https://good.no\u202eon.live',
      'https://ex.com/\u0001',
      '\u0000javascript.com',
      'https://matprat\u200b.no',
      `example.com/${'a'.repeat(MAX_RECIPE_URL - 15)}`,
      `https://example.com/${'a'.repeat(MAX_RECIPE_URL)}`,
    ]) {
      expect([bad, normalizeRecipeUrl(bad)]).toEqual([bad, null]);
    }
  });
});

test('recipeSite shows the host without www', () => {
  expect(recipeSite('https://www.Matprat.no/oppskrifter/tacos')).toBe('matprat.no');
  expect(recipeSite('http://example.com:8080?x')).toBe('example.com');
  expect(recipeSite('https://nrk.no')).toBe('nrk.no');
  expect(recipeSite('https://matprat.no./x')).toBe('matprat.no');
});
