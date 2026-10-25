import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { getCalendars } from 'expo-localization';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRight, Home, Mail } from '@/components/icons';
import { Button, Field, Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { accountLabel } from '@/lib/format';
import { useMe } from '@/lib/session';

/** "Kari Hansen" -> "Hansen family" / "Familien Hansen"; empty without a last name. */
function suggestedFamilyName(
  name: string,
  t: (key: 'welcome.familyNameFrom', o: { last: string }) => string,
) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? t('welcome.familyNameFrom', { last: parts[parts.length - 1] }) : '';
}

/** First run after sign-in: create a family, or join one with an invite code (GRO-24). */
export default function WelcomeScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useMe();
  const { signOut } = useAuthActions();
  const createFamily = useMutation(api.groups.create);
  const [name, setName] = useState(() => suggestedFamilyName(user.name, t));
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const timezone = getCalendars()[0]?.timeZone ?? 'Europe/Oslo';
    await attempt(t, () => createFamily({ name, timezone }));
    setBusy(false);
  }

  const firstName = user.name.split(' ')[0];
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      style={{ backgroundColor: colors.background }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
      ]}>
      <Text variant="title" style={{ fontSize: 32 }}>
        {firstName ? t('welcome.titleNamed', { name: firstName }) : t('welcome.title')}
      </Text>
      <Text color={colors.muted} style={{ marginTop: 12 }}>
        {t('welcome.intro')}
      </Text>

      <View style={[styles.card, styles.cardActive]}>
        <View style={styles.cardHead}>
          <View style={[styles.cardIcon, { backgroundColor: colors.saffronSoft }]}>
            <Home color={colors.tomato} strokeWidth={1.8} size={24} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="item" style={{ fontSize: 18 }}>
              {t('welcome.createTitle')}
            </Text>
            <Text variant="small" color={colors.muted} style={{ fontSize: 14 }}>
              {t('welcome.createHint')}
            </Text>
          </View>
        </View>
        <Field
          label={t('welcome.familyName')}
          value={name}
          onChangeText={setName}
          placeholder={t('welcome.familyNamePlaceholder')}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
        />
        <Button
          title={t('welcome.createButton')}
          loading={busy}
          disabled={name.trim() === ''}
          onPress={() => void create()}
        />
      </View>

      <Pressable
        onPress={() => router.push('/join')}
        accessibilityRole="link"
        style={({ pressed }) => [styles.card, styles.row, pressed && { opacity: 0.7 }]}>
        <View style={[styles.cardIcon, { backgroundColor: colors.surface }]}>
          <Mail strokeWidth={1.8} size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="item" style={{ fontSize: 18 }}>
            {t('welcome.joinTitle')}
          </Text>
          <Text variant="small" color={colors.muted} style={{ fontSize: 14 }}>
            {t('welcome.joinHint')}
          </Text>
        </View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Text variant="small" color={colors.muted} style={styles.footer}>
        {t('welcome.next')}
      </Text>
      <Text variant="small" color={colors.muted} style={styles.signedIn}>
        {t('welcome.signedInAs', { who: accountLabel(user, t('account.hiddenAppleEmail')) })}
      </Text>
      <Button
        kind="ghost"
        title={t('account.signOut')}
        style={{ alignSelf: 'center' }}
        onPress={() => void signOut()}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flexGrow: 1, paddingHorizontal: Spacing.four },
  card: {
    marginTop: 14,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  cardActive: { marginTop: 32, borderWidth: 2, borderColor: colors.tomato },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { marginTop: 'auto', paddingTop: 24, textAlign: 'center', fontSize: 14 },
  signedIn: { marginTop: 16, textAlign: 'center', fontSize: 13 },
}));
