import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { createAccount } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

/**
 * Test users for development, copied from Hubbr's dev sign-in. Google and Apple sign-in are
 * parked (GRO-20/21); until then `signIn("dev", { persona })` signs in as one of these. The
 * account ids are prefixed so they can never collide with a real provider's subjects.
 */
export const DEV_PERSONAS = {
  kari: { name: 'Kari Hansen', email: 'kari@example.no' },
  ola: { name: 'Ola Hansen', email: 'ola@example.no' },
  emma: { name: 'Emma Hansen', email: 'emma@example.no' },
  ingrid: { name: 'Ingrid Berg', email: 'ingrid@example.no' },
} as const;

export type DevPersonaId = keyof typeof DEV_PERSONAS;

export function isDevPersonaId(id: unknown): id is DevPersonaId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(DEV_PERSONAS, id);
}

/**
 * Off unless the deployment sets `GROCR_DEV_SIGN_IN=enabled`. Only the dev deployment sets it,
 * so a production deployment fails closed.
 */
export function devSignInEnabled(): boolean {
  return process.env.GROCR_DEV_SIGN_IN === 'enabled';
}

export const DevSignIn = ConvexCredentials({
  id: 'dev',
  authorize: async (params, ctx) => {
    if (!devSignInEnabled()) throw new ConvexError({ code: 'DEV_SIGN_IN_DISABLED' });
    if (!isDevPersonaId(params.persona)) throw new ConvexError({ code: 'UNKNOWN_PERSONA' });
    const { user } = await createAccount(ctx, {
      provider: 'dev',
      account: { id: `dev-${params.persona}` },
      profile: DEV_PERSONAS[params.persona],
    });
    return { userId: user._id };
  },
});
