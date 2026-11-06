import { newSince } from './list-seen';

jest.mock('convex/react', () => ({ useMutation: () => jest.fn() }));
jest.mock('@/convex/_generated/api', () => ({
  api: { grocery: { markSeen: 'grocery.markSeen' } },
}));

const row = (
  id: string,
  createdAt: number,
  extra: Partial<Parameters<typeof newSince>[0][0]> = {},
) => ({
  _id: id,
  createdAt,
  byOther: true,
  checked: false,
  ...extra,
});

test('only open rows someone else added after the last look count', () => {
  const rows = [
    row('old', 90),
    row('same', 100),
    row('new', 101),
    row('mine', 120, { byOther: false }),
    row('bought', 130, { checked: true }),
    row('home', 140, { atHome: true }),
    // A backend from before GRO-70 sends neither field.
    { _id: 'legacy', checked: false },
  ];
  expect([...newSince(rows, 100)]).toEqual(['new']);
});

test('nothing counts without a last look to compare with', () => {
  expect(newSince([row('a', 5)], null).size).toBe(0);
});
