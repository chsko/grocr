import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { showError } from '@/lib/errors';

/**
 * Sign-in. Google and Apple are parked (GRO-20/21), so for now this lists the backend's test
 * users, the same way Hubbr does. The list is empty unless the deployment enables them.
 */
export default function SignInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const personas = useQuery(api.devSignIn.personas);
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState<string | null>(null);

  async function signInAs(persona: string) {
    setPending(persona);
    try {
      await signIn('dev', { persona });
    } catch (error) {
      showError(t, error);
    } finally {
      setPending(null);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}>
      <View style={[styles.hero, { paddingTop: insets.top + 24 }]}>
        <View style={styles.logoTile}>
          <Logo size={104} />
        </View>
        <Text variant="display" style={{ fontSize: 44, lineHeight: 48 }}>
          Grocr
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="heading" style={{ fontSize: 28, lineHeight: 32 }}>
          {t('signIn.headline')}{' '}
          <Text variant="heading" color={Colors.tomato} style={{ fontSize: 28, lineHeight: 32 }}>
            {t('signIn.headlineAccent')}
          </Text>
        </Text>
        <Text color={Colors.muted}>{t('signIn.pitch')}</Text>
      </View>
      <View style={styles.actions}>
        {personas !== undefined && personas.length > 0 ? (
          <>
            <Text variant="section" color={Colors.muted}>
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
                onPress={() => void signInAs(p.id)}
              />
            ))}
          </>
        ) : personas !== undefined ? (
          <Text color={Colors.muted} style={{ textAlign: 'center' }}>
            {t('signIn.comingSoon')}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1 },
  hero: {
    minHeight: 340,
    backgroundColor: Colors.saffronTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 24,
  },
  logoTile: {
    width: 104,
    height: 104,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: Colors.tomato,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  body: { paddingHorizontal: Spacing.four, paddingTop: 32, gap: 12 },
  actions: { paddingHorizontal: Spacing.four, paddingTop: 32, gap: 12, marginTop: 'auto' },
});
