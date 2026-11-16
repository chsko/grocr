/**
 * Sign-in on the website (grocr.io/app). Google leaves the page for Google's sign-in and comes
 * back to /app with a code, which ConvexAuthProvider exchanges on load. Apple runs Sign in with
 * Apple JS in a popup with the web Services ID, the same way grocr.io/delete-account does, and
 * reuses that page's registered return URL (popups report back to this same origin).
 */
type SignIn = (
  provider: string,
  params?: Record<string, string>,
) => Promise<{ signingIn: boolean; redirect?: URL }>;

const APPLE_SERVICES_ID = 'io.grocr.web';
const APPLE_SCRIPT =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
/** Registered with Apple for io.grocr.web, and allowed by the backend (lib/authRedirect.ts). */
const APPLE_REDIRECT = 'https://grocr.io/delete-account';
/** Where Google sends the code back to; the backend only allows the live site. */
export const WEB_HOME = '/app';

type AppleId = {
  auth: {
    init(options: Record<string, unknown>): void;
    signIn(): Promise<{
      authorization: { id_token: string; code?: string };
      user?: { name?: { firstName?: string; lastName?: string } };
    }>;
  };
};

export async function signInWithGoogle(signIn: SignIn): Promise<boolean> {
  // ConvexAuthProvider stores the verifier and navigates to Google itself.
  await signIn('google', { redirectTo: window.location.origin + WEB_HOME });
  return true;
}

let script: Promise<void> | null = null;
function loadAppleScript(): Promise<void> {
  script ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = APPLE_SCRIPT;
    tag.onload = () => resolve();
    tag.onerror = () => {
      script = null;
      reject(new Error('Could not load Sign in with Apple'));
    };
    document.head.appendChild(tag);
  });
  return script;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh nonce, prepared ahead so the popup opens straight from the click (no blocker). */
let prepared: { nonce: string; hashed: string } | null = null;
async function prepareNonce() {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
  prepared = { nonce, hashed };
}

/** Loads Apple's script and a nonce; resolves true when the button can be shown. */
export async function appleSignInAvailable(): Promise<boolean> {
  try {
    await Promise.all([loadAppleScript(), prepareNonce()]);
    return (window as unknown as { AppleID?: AppleId }).AppleID !== undefined;
  } catch {
    return false;
  }
}

export async function signInWithApple(signIn: SignIn): Promise<boolean> {
  const appleId = (window as unknown as { AppleID?: AppleId }).AppleID;
  const current = prepared;
  if (!appleId || !current) throw new Error('Sign in with Apple is not ready');
  prepared = null;
  appleId.auth.init({
    clientId: APPLE_SERVICES_ID,
    scope: 'name email',
    redirectURI: APPLE_REDIRECT,
    nonce: current.hashed,
    usePopup: true,
  });
  let response;
  try {
    response = await appleId.auth.signIn();
  } catch (error) {
    if ((error as { error?: string }).error === 'popup_closed_by_user') return false;
    if ((error as { error?: string }).error === 'user_cancelled_authorize') return false;
    throw error;
  } finally {
    void prepareNonce();
  }
  const name = [response.user?.name?.firstName, response.user?.name?.lastName]
    .filter(Boolean)
    .join(' ');
  await signIn('apple', {
    identityToken: response.authorization.id_token,
    nonce: current.nonce,
    redirectUri: APPLE_REDIRECT,
    ...(response.authorization.code ? { authorizationCode: response.authorization.code } : {}),
    ...(name ? { name } : {}),
  });
  return true;
}
