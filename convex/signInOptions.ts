import { query } from './_generated/server';
import { appleAudiences } from './lib/apple';
import { DEV_PERSONAS, devSignInEnabled } from './lib/devSignIn';

/**
 * What the sign-in screen offers on this deployment: Google and Apple once their credentials
 * are set, and the test users only where dev sign-in is enabled.
 */
export const get = query({
  args: {},
  handler: () => ({
    google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    apple: appleAudiences().length > 0,
    personas: devSignInEnabled()
      ? Object.entries(DEV_PERSONAS).map(([id, p]) => ({ id, name: p.name }))
      : [],
  }),
});
