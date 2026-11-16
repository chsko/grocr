import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleLogo, GoogleLogo, Logo } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors, useResolvedScheme } from '@/lib/appearance';
import { isDevBuild, isWebSite } from '@/lib/build';
import { useDesktop } from '@/lib/desktop';
import { showError } from '@/lib/errors';
import { appleSignInAvailable, signInWithApple, signInWithGoogle } from '@/lib/socialSignIn';

/**
 * Sign-in with Apple (iPhone) and Google (GRO-20/21). Below them the dev deployment lists its
 * test users, the same way Hubbr does; the list is empty unless the deployment enables them
 * and this is a dev copy of the app (see lib/build.ts).
 */
export default function SignInScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const options = useQuery(api.signInOptions.get);
  // TestFlight and store builds share the dev backend for now, so they hide its test users.
  const personas = isDevBuild() ? options?.personas : [];
  const { signIn } = useAuthActions();
  const scheme = useResolvedScheme();
  const desktop = useDesktop();
  const [pending, setPending] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'web') return;
    let live = true;
    void appleSignInAvailable().then((available) => {
      if (live) setAppleAvailable(available);
    });
    return () => {
      live = false;
    };
  }, []);

  async function run(key: string, action: () => Promise<unknown>) {
    setPending(key);
    try {
      await action();
    } catch (error) {
      showError(t, error);
    } finally {
      setPending(null);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 32 },
        desktop && styles.desktop,
      ]}>
      <View style={[styles.hero, { paddingTop: insets.top + 24 }, desktop && styles.desktopHero]}>
        <View style={styles.logoTile}>
          <Logo size={104} />
        </View>
        <Text variant="display" style={{ fontSize: 44, lineHeight: 48 }}>
          Grocr
        </Text>
      </View>
      <View style={desktop ? styles.desktopSide : { flexGrow: 1 }}>
        <View style={styles.body}>
          <Text variant="heading" style={{ fontSize: 28, lineHeight: 32 }}>
            {t(isWebSite ? 'signIn.webHeadline' : 'signIn.headline')}{' '}
            <Text variant="heading" color={colors.tomato} style={{ fontSize: 28, lineHeight: 32 }}>
              {t(isWebSite ? 'signIn.webHeadlineAccent' : 'signIn.headlineAccent')}
            </Text>
          </Text>
          <Text color={colors.muted}>{t(isWebSite ? 'signIn.webPitch' : 'signIn.pitch')}</Text>
        </View>
        <View style={[styles.actions, desktop && { marginTop: 0 }]}>
          {Platform.OS === 'web' && appleAvailable && options?.apple ? (
            <Button
              testID="sign-in-apple"
              kind="dark"
              title={t('signIn.apple')}
              icon={<AppleLogo size={18} color={colors.background} />}
              loading={pending === 'apple'}
              disabled={pending !== null && pending !== 'apple'}
              onPress={() => void run('apple', () => signInWithApple(signIn))}
            />
          ) : null}
          {Platform.OS !== 'web' && appleAvailable && options?.apple ? (
            <AppleAuthentication.AppleAuthenticationButton
              testID="sign-in-apple"
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={Radius.button}
              style={[styles.appleButton, pending !== null && { opacity: 0.45 }]}
              onPress={() => {
                if (pending === null) void run('apple', () => signInWithApple(signIn));
              }}
            />
          ) : null}
          {options?.google ? (
            <Button
              testID="sign-in-google"
              kind="secondary"
              title={t('signIn.google')}
              icon={<GoogleLogo size={20} />}
              loading={pending === 'google'}
              disabled={pending !== null && pending !== 'google'}
              onPress={() => void run('google', () => signInWithGoogle(signIn))}
            />
          ) : null}
          {personas !== undefined && personas.length > 0 ? (
            <>
              <Text variant="section" color={colors.muted} style={{ marginTop: 12 }}>
                {t('signIn.testUsers')}
              </Text>
              {personas.map((p, index) => (
                <Button
                  key={p.id}
                  testID={`dev-sign-in-${p.id}`}
                  kind={index === 0 ? 'dark' : 'secondary'}
                  title={t('signIn.continueAs', { name: p.name })}
                  loading={pending === p.id}
                  disabled={pending !== null && pending !== p.id}
                  onPress={() => void run(p.id, () => signIn('dev', { persona: p.id }))}
                />
              ))}
            </>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flexGrow: 1 },
  hero: {
    minHeight: 340,
    backgroundColor: colors.saffronTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 24,
  },
  logoTile: {
    width: 104,
    height: 104,
    borderRadius: 28,
    backgroundColor: colors.raised,
    shadowColor: colors.tomato,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  body: { paddingHorizontal: Spacing.four, paddingTop: 32, gap: 12 },
  actions: { paddingHorizontal: Spacing.four, paddingTop: 32, gap: 12, marginTop: 'auto' },
  appleButton: { height: 54 },
  // The website on a big screen: the saffron hero on the left, sign-in on the right.
  desktop: { flexDirection: 'row', paddingBottom: 0 },
  desktopHero: { flex: 1, minHeight: '100%' },
  desktopSide: { width: 480, justifyContent: 'center', paddingVertical: 48 },
}));
