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
