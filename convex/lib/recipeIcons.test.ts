import { describe, expect, test } from 'vitest';

import { DEFAULT_ICON, guessIcon, isRecipeIcon, recipeIcon } from './recipeIcons';

describe('recipe icons', () => {
  test('guesses from English and Norwegian titles', () => {
    expect(guessIcon('Tacos')).toBe('🌮');
    expect(guessIcon('Fredagstaco')).toBe('🌮');
    expect(guessIcon('Fiskesuppe')).toBe('🍲');
    expect(guessIcon('Fårikål'.normalize('NFD'))).toBe('🥘');
    expect(guessIcon('Spaghetti bolognese')).toBe('🍝');
    expect(guessIcon('Laks med poteter')).toBe('🐟');
    expect(guessIcon('Kylling-curry')).toBe('🍛');
    expect(guessIcon('Paris-salat')).toBe('🥗');
  });

  test('falls back to the plate', () => {
    expect(guessIcon('Mormors spesial')).toBe(DEFAULT_ICON);
  });

  test('a chosen icon wins over the guess', () => {
    expect(recipeIcon({ title: 'Tacos', icon: '🍕' })).toBe('🍕');
    expect(recipeIcon({ title: 'Tacos', icon: 'x' })).toBe('🌮');
    expect(isRecipeIcon('🍕')).toBe(true);
    expect(isRecipeIcon('🦄')).toBe(false);
  });
});
