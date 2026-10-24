import { convexAuth } from '@convex-dev/auth/server';

// Google and Apple providers are added in the sign-in epic (GRO-20, GRO-21).
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [],
});
