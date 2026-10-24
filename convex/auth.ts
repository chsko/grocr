import { convexAuth } from '@convex-dev/auth/server';

import { DevSignIn } from './lib/devSignIn';

// Google and Apple (GRO-20, GRO-21) are parked; test users sign in through DevSignIn meanwhile.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [DevSignIn],
});
