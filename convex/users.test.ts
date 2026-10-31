import { describe, expect, test } from 'vitest';

import { api } from './_generated/api';
import { setup, signedInUser } from './test.setup';

describe('get-started tour', () => {
  test('new users have not seen it; finishing it sticks and keeps the first time', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    expect((await kari.as.query(api.users.me, {}))?.user.tourDone).toBe(false);

    await kari.as.mutation(api.users.finishTour, {});
    expect((await kari.as.query(api.users.me, {}))?.user.tourDone).toBe(true);
    const first = await t.run(async (ctx) => (await ctx.db.get('users', kari.userId))?.tourDoneAt);

    await kari.as.mutation(api.users.finishTour, {});
    const again = await t.run(async (ctx) => (await ctx.db.get('users', kari.userId))?.tourDoneAt);
    expect(again).toBe(first);
  });

  test('only marks the caller, and needs sign-in', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    await kari.as.mutation(api.users.finishTour, {});
    expect((await ola.as.query(api.users.me, {}))?.user.tourDone).toBe(false);
    await expect(t.mutation(api.users.finishTour, {})).rejects.toThrow();
  });
});

describe("what's new", () => {
  const seen = async (as: Awaited<ReturnType<typeof signedInUser>>['as']) =>
    (await as.query(api.users.me, {}))?.user.whatsNewSeen;

  test('starts unseen and only moves forward', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    expect(await seen(kari.as)).toBeNull();

    await kari.as.mutation(api.users.seeWhatsNew, { upTo: 5 });
    expect(await seen(kari.as)).toBe(5);
    // An older app version knows fewer entries; it must not bring them back.
    await kari.as.mutation(api.users.seeWhatsNew, { upTo: 3 });
    expect(await seen(kari.as)).toBe(5);
    await kari.as.mutation(api.users.seeWhatsNew, { upTo: 6 });
    expect(await seen(kari.as)).toBe(6);
  });

  test('ignores nonsense numbers', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    for (const upTo of [0, -1, 2.5, 1_000_000, Number.NaN]) {
      await kari.as.mutation(api.users.seeWhatsNew, { upTo });
    }
    expect(await seen(kari.as)).toBeNull();
  });

  test('finishing the tour catches a new member up, but only the first time', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    await kari.as.mutation(api.users.finishTour, { whatsNewSeen: 4 });
    expect(await seen(kari.as)).toBe(4);
    // Reopening the tour later does not touch it.
    await kari.as.mutation(api.users.finishTour, { whatsNewSeen: 9 });
    expect(await seen(kari.as)).toBe(4);
  });

  test('only marks the caller, and needs sign-in', async () => {
    const t = setup();
    const kari = await signedInUser(t, 'Kari');
    const ola = await signedInUser(t, 'Ola');
    await kari.as.mutation(api.users.seeWhatsNew, { upTo: 2 });
    expect(await seen(ola.as)).toBeNull();
    await expect(t.mutation(api.users.seeWhatsNew, { upTo: 2 })).rejects.toThrow();
  });
});
