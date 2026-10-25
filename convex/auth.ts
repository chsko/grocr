import Google from '@auth/core/providers/google';
import { convexAuth } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { AppleSignIn } from './lib/appleSignIn';
import { expoGoEnabled, isAllowedRedirect } from './lib/authRedirect';
import { findOrCreateUser, refreshEmail } from './lib/authUsers';
import { DevSignIn } from './lib/devSignIn';

// Google (GRO-20) runs Convex Auth's OAuth flow with AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET. Apple
// (GRO-21) verifies Apple's identity token (lib/appleSignIn.ts). DevSignIn only works where
// GROCR_DEV_SIGN_IN=enabled, which only the dev deployment sets.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      profile: (profile) => ({
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        emailVerified: profile.email_verified === true,
      }),
    }),
    AppleSignIn,
    DevSignIn,
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      if (!isAllowedRedirect(redirectTo, expoGoEnabled())) {
        throw new ConvexError({ code: 'INVALID_REDIRECT' });
      }
      return redirectTo;
    },
    // A returning account keeps the name they set in Grocr (Apple only sends it once), but a
    // changed email is refreshed so a stale, recycled address can't link to them later.
    async createOrUpdateUser(ctx, { existingUserId, provider, profile }) {
      const db = (ctx as unknown as MutationCtx).db;
      if (existingUserId === null) {
        return await findOrCreateUser(ctx as unknown as MutationCtx, provider.id, profile);
      }
      const userId = existingUserId as Id<'users'>;
      await refreshEmail(db, userId, provider.id, profile);
      return userId;
    },
  },
});
