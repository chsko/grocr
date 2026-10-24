import { query } from './_generated/server';
import { DEV_PERSONAS, devSignInEnabled } from './lib/devSignIn';

/** Test users for the sign-in screen; empty when dev sign-in is disabled. */
export const personas = query({
  args: {},
  handler: () => {
    if (!devSignInEnabled()) return [];
    return Object.entries(DEV_PERSONAS).map(([id, p]) => ({ id, name: p.name }));
  },
});
