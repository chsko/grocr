import { useAuthActions } from '@convex-dev/auth/react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Logo } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/appearance';

/** Header button on the website's gift list; the app signs out under Family instead. */
export function WebSignOut() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const { signOut } = useAuthActions();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => void signOut()}
      style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.6 }]}>
      <Text variant="item" color={colors.tomato}>
        {t('account.signOut')}
      </Text>
    </Pressable>
  );
}

/** Signed in on the website without a family: families are made and joined in the app. */
export function WebNoFamily() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const { signOut } = useAuthActions();
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={styles.card}>
        <Logo size={72} />
        <Text variant="heading">{t('web.noFamilyTitle')}</Text>
        <Text color={colors.muted}>{t('web.noFamilyBody')}</Text>
        <Button kind="secondary" title={t('account.signOut')} onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  headerButton: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: { maxWidth: 420, width: '100%', gap: 16, alignItems: 'flex-start' },
}));
