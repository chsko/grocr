import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Doc, Id, TableNames } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

// Access rules (Architecture doc §4): never trust client-supplied user or group ids. Load the
// document first, then check membership against its stored `groupId`. A document in another
// group is reported as "not found" so ids cannot be probed.

export type AccessErrorCode = 'UNAUTHENTICATED' | 'NOT_FOUND';

export function accessError(code: AccessErrorCode) {
  return new ConvexError({ code });
}

type GroupScopedTable = {
  [T in TableNames]: Doc<T> extends { groupId: Id<'groups'> } ? T : never;
}[TableNames];

export async function requireUserId(ctx: QueryCtx): Promise<Id<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw accessError('UNAUTHENTICATED');
  return userId;
}

export async function getMembership(ctx: QueryCtx, groupId: Id<'groups'>, userId: Id<'users'>) {
  return await ctx.db
    .query('memberships')
    .withIndex('by_group_user', (q) => q.eq('groupId', groupId).eq('userId', userId))
    .unique();
}

/** The signed-in user's membership of `groupId`; throws NOT_FOUND if they are not a member. */
export async function requireMembership(ctx: QueryCtx, groupId: Id<'groups'>) {
  const userId = await requireUserId(ctx);
  const membership = await getMembership(ctx, groupId, userId);
  if (membership === null) throw accessError('NOT_FOUND');
  return { userId, membership };
}

/** Checks that the signed-in user is a member of the group a loaded document belongs to. */
export async function requireMemberOf(ctx: QueryCtx, doc: { groupId: Id<'groups'> } | null) {
  if (doc === null) throw accessError('NOT_FOUND');
  return await requireMembership(ctx, doc.groupId);
}

/**
 * Loads a group-scoped document by id and checks membership. Missing documents and documents in
 * a group the user is not a member of both throw NOT_FOUND.
 */
export async function loadForMember<T extends GroupScopedTable>(
  ctx: QueryCtx,
  table: T,
  id: Id<T>,
) {
  const doc = (await ctx.db.get(table, id)) as (Doc<T> & { groupId: Id<'groups'> }) | null;
  const access = await requireMemberOf(ctx, doc);
  return { doc: doc!, ...access };
}

/** Throws NOT_FOUND unless every referenced document belongs to `groupId`. */
export function assertSameGroup(groupId: Id<'groups'>, docs: { groupId: Id<'groups'> }[]) {
  for (const doc of docs) {
    if (doc.groupId !== groupId) throw accessError('NOT_FOUND');
  }
}
