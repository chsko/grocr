// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  changedPairs,
  describeFiles,
  flatten,
  gatePasses,
  NEEDS_REVIEW_LABEL,
  parityRequests,
  REVIEW_DONE_LABEL,
  riskLevel,
} from './lib.mjs';

describe('risk gate', () => {
  test('levels from the jev score', () => {
    expect(riskLevel(0)).toBe('low');
    expect(riskLevel(0.59)).toBe('low');
    expect(riskLevel(1.1)).toBe('medium');
    expect(riskLevel(1.5)).toBe('high');
    expect(riskLevel(2)).toBe('high');
    expect(riskLevel(undefined)).toBeUndefined();
    expect(riskLevel(Number.NaN)).toBeUndefined();
  });

  test('high-risk PRs need an adversarial review signed off by an admin or maintainer', () => {
    expect(gatePasses([])).toBe(true);
    expect(gatePasses(['risk:high', NEEDS_REVIEW_LABEL])).toBe(false);
    expect(gatePasses([NEEDS_REVIEW_LABEL, REVIEW_DONE_LABEL], 'admin')).toBe(true);
    expect(gatePasses([NEEDS_REVIEW_LABEL, REVIEW_DONE_LABEL], 'maintain')).toBe(true);
    expect(gatePasses([NEEDS_REVIEW_LABEL, REVIEW_DONE_LABEL], 'write')).toBe(false);
    expect(gatePasses([NEEDS_REVIEW_LABEL, REVIEW_DONE_LABEL], undefined)).toBe(false);
  });

  test('file descriptions carry capped diff excerpts', () => {
    const files = [
      { filename: 'a.ts', status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(50) },
      { filename: 'b.png', status: 'added', additions: 0, deletions: 0 },
      { filename: 'c.ts', status: 'modified', additions: 1, deletions: 0, patch: 'y'.repeat(50) },
    ];
    const described = describeFiles(files, { perFile: 30, total: 40 });
    expect(described[0].diff).toHaveLength(30);
    expect(described[1].diff).toBeUndefined();
    expect(described[2].diff).toHaveLength(10);
  });
});

describe('translation parity', () => {
  test('flatten', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } }, e: 'z' })).toEqual({
      'a.b': 'x',
      'a.c.d': 'y',
      e: 'z',
    });
  });

  test('changed and added pairs, missing keys reported apart', () => {
    const base = { en: { a: 'Hi', b: 'Bye' }, nb: { a: 'Hei', b: 'Ha det' } };
    const head = {
      en: { a: 'Hi', b: 'Goodbye', c: 'New', d: 'Only English' },
      nb: { a: 'Hei', b: 'Ha det', c: 'Ny' },
    };
    expect(changedPairs(base, head)).toEqual({
      pairs: [
        { key: 'b', en: 'Goodbye', nb: 'Ha det' },
        { key: 'c', en: 'New', nb: 'Ny' },
      ],
      missing: ['d'],
    });
  });

  test('requests are batched with one named question per pair', () => {
    const pairs = Array.from({ length: 25 }, (_, i) => ({ key: `k${i}`, en: 'x', nb: 'y' }));
    const requests = parityRequests(pairs, 20);
    expect(requests).toHaveLength(2);
    expect(Object.keys(requests[0].questions)).toHaveLength(20);
    expect(requests[1].names.s4.key).toBe('k24');
    expect(requests[0].state.strings.s0).toEqual({ key: 'k0', en: 'x', nb: 'y' });
  });
});
