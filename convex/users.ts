import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { currentMembership, requireUserId } from './lib/access';
import { cleanName, familySections, sectionOrder } from './lib/catalog';

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
      user: {
        _id: user._id,
        name: user.name ?? '',
        email: user.email,
        tourDone: user.tourDoneAt !== undefined,
        whatsNewSeen: user.whatsNewSeen ?? null,
      },
      family:
        membership && group
          ? {
              groupId: group._id,
              name: group.name,
              role: membership.role,
              weekStartsOn: group.weekStartsOn,
              timezone: group.timezone,
              sections: familySections(group),
              // For app versions from before GRO-51, which only know the built-in sections.
              sectionOrder: sectionOrder(familySections(group).map((s) => s.key)),
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

/**
 * Marks the get-started tour as seen, so it no longer opens by itself on any device. A new
 * member has nothing to catch up on, so the app also passes its newest "What's new" entry.
 */
export const finishTour = mutation({
  args: { whatsNewSeen: v.optional(v.number()) },
  handler: async (ctx, { whatsNewSeen }) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get('users', userId);
    if (user && user.tourDoneAt === undefined) {
      await ctx.db.patch('users', userId, {
        tourDoneAt: Date.now(),
        ...seenPatch(user.whatsNewSeen, whatsNewSeen),
      });
    }
  },
});

/** Records that they have seen the "What's new" entries up to `upTo` (GRO-66). */
export const seeWhatsNew = mutation({
  args: { upTo: v.number() },
  handler: async (ctx, { upTo }) => {
    const userId = await requireUserId(ctx);
    const user = await ctx.db.get('users', userId);
    if (user === null) return;
    const patch = seenPatch(user.whatsNewSeen, upTo);
    if (patch.whatsNewSeen !== undefined) await ctx.db.patch('users', userId, patch);
  },
});

/** Only ever moves forward, so an older app version can't show entries again. */
function seenPatch(current: number | undefined, next: number | undefined) {
  if (next === undefined || !Number.isInteger(next) || next < 1 || next > 100_000) return {};
  if (current !== undefined && current >= next) return {};
  return { whatsNewSeen: next };
}
