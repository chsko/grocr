import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { assertSameGroup, requireMembership, requireUserId } from './lib/access';

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
 * which keeps the original `checkedBy`/`checkedAt`. Returns how many rows changed.
 */
export const setChecked = mutation({
  args: { itemIds: v.array(v.id('groceryItems')), checked: v.boolean() },
  handler: async (ctx, { itemIds, checked }) => {
    const userId = await requireUserId(ctx);
    if (itemIds.length === 0) return 0;
    if (itemIds.length > 100) throw new ConvexError({ code: 'TOO_MANY_ITEMS' });

    const items = await Promise.all(itemIds.map((id) => ctx.db.get('groceryItems', id)));
    const found = items.filter((item) => item !== null);
    // A row deleted by someone else (e.g. "clear checked") is skipped, not an error: the
    // mutation may be a resend from a client that was offline.
    if (found.length === 0) return 0;
    const groupId = found[0].groupId;
    assertSameGroup(groupId, found);
    await requireMembership(ctx, groupId);

    let changed = 0;
    const now = Date.now();
    for (const item of found) {
      if (item.checked === checked) continue;
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
