/// <reference types="vite/client" />
import { convexTest } from 'convex-test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

export const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts']);

export function setup() {
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof setup>;

/** Creates a user and returns a client authenticated as them (Convex Auth subject format). */
export async function signedInUser(t: TestConvex, name: string) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name }));
  return { userId, as: t.withIdentity({ subject: `${userId}|session-${name}` }) };
}

export async function groupWithMembers(t: TestConvex, members: Id<'users'>[]) {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert('groups', {
      name: 'Family',
      ownerId: members[0],
      weekStartsOn: 1,
      timezone: 'Europe/Oslo',
      createdAt: Date.now(),
    });
    for (const [index, userId] of members.entries()) {
      await ctx.db.insert('memberships', {
        groupId,
        userId,
        role: index === 0 ? 'owner' : 'member',
        joinedAt: Date.now(),
      });
    }
    return groupId;
  });
}

export async function listWithItems(
  t: TestConvex,
  groupId: Id<'groups'>,
  startDate: string,
  names: string[],
) {
  return await t.run(async (ctx) => {
    const listId = await ctx.db.insert('groceryLists', {
      groupId,
      startDate,
      endDate: startDate,
    });
    const itemIds = [];
    for (const name of names) {
      itemIds.push(
        await ctx.db.insert('groceryItems', {
          groupId,
          listId,
          name,
          section: 'Other',
          checked: false,
          edited: false,
          source: { kind: 'manual' },
          createdAt: Date.now(),
        }),
      );
    }
    return { listId, itemIds };
  });
}

export type JevRequest = {
  state: { items: string[] };
  questions: Record<string, { criteria: Record<string, string> }>;
};

/**
 * A fake jev that puts each item in the section whose description contains `picks[item]` (or
 * answers outside the choices when it has no pick), with the given confidence.
 */
export function fakeJev(picks: Record<string, string>, confidence = 0.9) {
  return async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as JevRequest;
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([name, question]) => {
        const want = picks[body.state.items[Number(name.slice(1))]];
        const choice =
          (want !== undefined &&
            Object.entries(question.criteria).find(([, d]) => d.includes(want))?.[0]) ||
          'spaceship';
        return [name, { type: 'choice', choice, confidence }];
      }),
    );
    return Response.json({ answers });
  };
}

/** Adds an item to the Monday 2026-10-26 list by hand and returns its catalog item. */
export async function addItem(
  ada: Awaited<ReturnType<typeof signedInUser>>,
  groupId: Id<'groups'>,
  name: string,
) {
  await ada.as.mutation(api.grocery.addManual, { groupId, startDate: '2026-10-26', name });
  const list = await ada.as.query(api.grocery.listForWeek, { groupId, startDate: '2026-10-26' });
  return list.items.find((i) => i.name === name)!.ingredientId!;
}

/** A catalog item's [section, sectionSource]. */
export async function ingredient(t: TestConvex, id: Id<'ingredients'>) {
  const doc = await t.run((ctx) => ctx.db.get('ingredients', id));
  return [doc?.section, doc?.sectionSource];
}
