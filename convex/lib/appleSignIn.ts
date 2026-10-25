import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import { createAccount } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import { internal } from '../_generated/api';
import type { DataModel } from '../_generated/dataModel';
import {
  appleAudiences,
  appleEmailVerified,
  appleKeyConfigured,
  exchangeAppleCode,
  verifyAppleIdentityToken,
} from './apple';
import { isAllowedRedirect } from './authRedirect';
import { cleanName } from './catalog';

const EXPO_GO_CLIENT_ID = 'host.exp.Exponent';

/**
 * `signIn("apple", { identityToken, nonce, authorizationCode?, name? })`. The account id is
 * Apple's `sub`, which is the same for the app and the web Services ID (same team). Apple only
 * shares the name on the first sign-in, so the app passes it along then.
 */
export const AppleSignIn = ConvexCredentials<DataModel>({
  id: 'apple',
  authorize: async (params, ctx) => {
    const { identityToken, nonce, authorizationCode, name, redirectUri } = params;
    if (typeof identityToken !== 'string' || typeof nonce !== 'string') {
      throw new ConvexError({ code: 'APPLE_SIGN_IN_FAILED' });
    }
    let claims;
    try {
      claims = await verifyAppleIdentityToken(identityToken, nonce, appleAudiences());
    } catch (error) {
      console.warn('Apple identity token rejected', error);
      throw new ConvexError({ code: 'APPLE_SIGN_IN_FAILED' });
    }
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : undefined;
    // Any Expo Go project can get a token for Expo Go's client id, so those (dev only) never
    // count as a verified email and never link to an existing user.
    const verified = appleEmailVerified(claims) && claims.aud !== EXPO_GO_CLIENT_ID;
    const cleanedName = typeof name === 'string' ? cleanName(name).slice(0, 60) : '';
    const { user } = await createAccount(ctx, {
      provider: 'apple',
      account: { id: claims.sub },
      profile: {
        ...(email ? { email } : {}),
        ...(email && verified ? { emailVerificationTime: Date.now() } : {}),
        ...(cleanedName ? { name: cleanedName } : {}),
      },
    });
    // Keep a refresh token so deleting the account can revoke Grocr's access at Apple. Sign-in
    // still works without it (for example in Expo Go, whose client id isn't ours).
    if (typeof authorizationCode === 'string' && appleKeyConfigured()) {
      try {
        // The website's Services ID flow must repeat its redirect URI; the app's must not.
        const webRedirect =
          typeof redirectUri === 'string' && isAllowedRedirect(redirectUri, false)
            ? redirectUri
            : undefined;
        const refreshToken = await exchangeAppleCode(claims.aud, authorizationCode, webRedirect);
        await ctx.runMutation(internal.appleTokens.save, {
          userId: user._id,
          clientId: claims.aud,
          refreshToken,
        });
      } catch (error) {
        console.warn('Could not keep an Apple refresh token', error);
      }
    }
    return { userId: user._id };
  },
});
