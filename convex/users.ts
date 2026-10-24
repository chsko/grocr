import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { currentMembership, requireUserId } from './lib/access';
import { cleanName, sectionOrder } from './lib/catalog';

/**
 * The signed-in user and their family. Returns null when signed out, so the app can route to
 * sign-in without an error; `family` is null until they create or join one.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    let userId;
    try {
      userId = await requireUserId(ctx);
    } catch {
      return null;
    }
    const user = await ctx.db.get('users', userId);
    if (user === null) return null;
    const membership = await currentMembership(ctx, userId);
    const group = membership ? await ctx.db.get('groups', membership.groupId) : null;
    return {
      user: { _id: user._id, name: user.name ?? '', email: user.email },
      family:
        membership && group
          ? {
              groupId: group._id,
              name: group.name,
              role: membership.role,
              weekStartsOn: group.weekStartsOn,
              timezone: group.timezone,
              sectionOrder: sectionOrder(group.sectionOrder),
            }
          : null,
    };
  },
});

export const setName = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    const clean = cleanName(name).slice(0, 60);
    if (clean === '') throw new ConvexError({ code: 'NAME_REQUIRED' });
    await ctx.db.patch('users', userId, { name: clean });
  },
});
