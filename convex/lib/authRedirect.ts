/**
 * Where OAuth sign-in (Google) may send the one-time code. Anything else is refused: an open
 * redirect would let someone start a sign-in, phish the victim through Google and catch the
 * code. The app uses `grocr://`, the website its delete-account page, and only deployments
 * that set `GROCR_EXPO_GO=enabled` (dev) accept Expo Go's `exp://` links.
 */
export function isAllowedRedirect(redirectTo: string, expoGo: boolean): boolean {
  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    return false;
  }
  if (url.protocol === 'grocr:') return true;
  if (url.protocol === 'exp:') return expoGo;
  return (
    url.protocol === 'https:' &&
    url.host === 'grocr.io' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/delete-account'
  );
}

export function expoGoEnabled(): boolean {
  return process.env.GROCR_EXPO_GO === 'enabled';
}
