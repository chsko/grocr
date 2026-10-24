import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getMembership, requireMembership, requireUserId } from './lib/access';

/** The grocery list for the week starting `startDate`, or null if nothing was added yet. */
export const listForWeek = query({
  args: { groupId: v.id('groups'), startDate: v.string() },
  handler: async (ctx, { groupId, startDate }) => {
    await requireMembership(ctx, groupId);
    const list = await ctx.db
      .query('groceryLists')
      .withIndex('by_group_startDate', (q) => q.eq('groupId', groupId).eq('startDate', startDate))
      .unique();
    if (list === null) return null;
    const items = await ctx.db
      .query('groceryItems')
      .withIndex('by_list', (q) => q.eq('listId', list._id))
      .collect();
    return { list, items };
  },
});

/**
 * Sets (never toggles) the checked state of every row behind a merged line, so a resent
 * mutation after reconnect is harmless. Rows already in the requested state are left untouched,
 * which keeps the original `checkedBy`/`checkedAt`. Rows that are gone (e.g. "clear checked" ran
 * while this client was offline) and rows in a family the user is not a member of are skipped
 * alike, so the result never reveals whether another family's id exists. Returns how many rows
 * changed.
 */
export const setChecked = mutation({
  args: { itemIds: v.array(v.id('groceryItems')), checked: v.boolean() },
  handler: async (ctx, { itemIds, checked }) => {
    const userId = await requireUserId(ctx);
    if (itemIds.length > 100) throw new ConvexError({ code: 'TOO_MANY_ITEMS' });

    const memberOf = new Map<Id<'groups'>, boolean>();
    const isMember = async (groupId: Id<'groups'>) => {
      if (!memberOf.has(groupId)) {
        memberOf.set(groupId, (await getMembership(ctx, groupId, userId)) !== null);
      }
      return memberOf.get(groupId)!;
    };

    let changed = 0;
    const now = Date.now();
    for (const itemId of new Set(itemIds)) {
      const item = await ctx.db.get('groceryItems', itemId);
      if (item === null || !(await isMember(item.groupId)) || item.checked === checked) continue;
      await ctx.db.patch(
        'groceryItems',
        item._id,
        checked
          ? { checked, checkedBy: userId, checkedAt: now }
          : { checked, checkedBy: undefined, checkedAt: undefined },
      );
      changed++;
    }
    return changed;
  },
});
