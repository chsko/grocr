import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

type SignIn = (
  provider: string,
  params?: Record<string, string>,
) => Promise<{ signingIn: boolean; redirect?: URL }>;

/**
 * Google through Convex Auth's OAuth flow in the system sign-in sheet, which works in Expo Go
 * too. The backend sends the code back to `grocr://` (or Expo Go's `exp://` on dev). Returns
 * false when the person cancels.
 */
export async function signInWithGoogle(signIn: SignIn): Promise<boolean> {
  const redirectTo = Linking.createURL('/');
  const { redirect } = await signIn('google', { redirectTo });
  if (redirect === undefined) return false;
  const result = await WebBrowser.openAuthSessionAsync(redirect.toString(), redirectTo);
  if (result.type !== 'success') return false;
  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') return false;
  await signIn('google', { code });
  return true;
}

export const appleSignInAvailable = AppleAuthentication.isAvailableAsync;

/**
 * Native Sign in with Apple. Apple gets the SHA-256 of a fresh nonce and the backend gets the
 * nonce itself, so a leaked identity token can't be replayed. Returns false on cancel.
 */
export async function signInWithApple(signIn: SignIn): Promise<boolean> {
  const nonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple returned no identity token');
  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  await signIn('apple', {
    identityToken: credential.identityToken,
    nonce,
    ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
    ...(name ? { name } : {}),
  });
  return true;
}
