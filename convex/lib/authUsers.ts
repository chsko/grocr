import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { cleanName } from './catalog';

/**
 * The user for a sign-in account seen for the first time. A Google or Apple account with a
 * verified email joins the one user who already has that email verified, so signing in with
 * the other provider (say Google on the website after Apple on the phone) reaches the same
 * family. Test users never link. Otherwise a new user is created.
 */
function verifiedEmail(providerId: string, profile: Record<string, unknown>) {
  const email = typeof profile.email === 'string' ? profile.email.toLowerCase() : undefined;
  const verified =
    providerId !== 'dev' &&
    email !== undefined &&
    (profile.emailVerified === true || typeof profile.emailVerificationTime === 'number');
  return { email, verified };
}

/**
 * When a returning Google or Apple account reports a different verified email, store the new
 * one; an address the user no longer holds must not stay "verified" on their user.
 */
export async function refreshEmail(
  db: MutationCtx['db'],
  userId: Id<'users'>,
  providerId: string,
  profile: Record<string, unknown>,
) {
  const { email, verified } = verifiedEmail(providerId, profile);
  if (!verified || email === undefined) return;
  const user = await db.get('users', userId);
  if (user === null || user.email === email) return;
  await db.patch('users', userId, { email, emailVerificationTime: Date.now() });
}

export async function findOrCreateUser(
  ctx: MutationCtx,
  providerId: string,
  profile: Record<string, unknown>,
): Promise<Id<'users'>> {
  const { email, verified } = verifiedEmail(providerId, profile);
  if (verified) {
    const matches = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .filter((q) => q.neq(q.field('emailVerificationTime'), undefined))
      .take(2);
    if (matches.length === 1) return matches[0]._id;
  }
  const name = typeof profile.name === 'string' ? cleanName(profile.name).slice(0, 60) : '';
  return await ctx.db.insert('users', {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(verified ? { emailVerificationTime: Date.now() } : {}),
  });
}
