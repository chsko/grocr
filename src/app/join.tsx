import { useMutation } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Field, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { CODE_LENGTH, normalizeCode } from '@/convex/lib/inviteCode';
import { attempt } from '@/lib/errors';

type Preview = {
  familyName: string;
  inviterName: string;
  memberCount: number;
  recipeCount: number;
};

/** Join a family with an invite code (GRO-25). `?code=` prefills it, e.g. from a link. */
export default function JoinScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const previewInvite = useMutation(api.invites.preview);
  const acceptInvite = useMutation(api.invites.accept);
  const [code, setCode] = useState(params.code ?? '');
  const [result, setResult] = useState<{
    code: string;
    preview?: Preview;
    problem?: 'invalid' | 'rateLimited';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = normalizeCode(code);
  // Results are kept with the code they answer, so editing the code hides a stale answer.
  const current = result?.code === normalized ? result : null;
  const preview = current?.preview ?? null;
  const problem = current?.problem ?? null;

  useEffect(() => {
    if (normalized.length !== CODE_LENGTH) return;
    let live = true;
    void attempt(t, () => previewInvite({ code: normalized })).then((answer) => {
      if (!live || answer === undefined) return;
      setResult(
        answer.status === 'ok'
          ? { code: normalized, preview: answer }
          : { code: normalized, problem: answer.status },
      );
    });
    return () => {
      live = false;
    };
  }, [normalized, previewInvite, t]);

  async function join() {
    setBusy(true);
    const answer = await attempt(t, () => acceptInvite({ code: normalized }));
    setBusy(false);
    // On success the guards move on to the app as soon as the family shows up.
    if (answer && answer.status !== 'ok') setResult({ code: normalized, problem: answer.status });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: Colors.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <Text variant="title">{t('join.title')}</Text>
        <Text color={Colors.muted} style={{ marginTop: 10 }}>
          {t('join.intro')}
        </Text>
        <Field
          label={t('join.codeLabel')}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={!params.code}
          maxLength={9}
          style={{ marginTop: 28 }}
          inputStyle={styles.codeInput}
        />
        {problem ? (
          <Text color={Colors.danger} style={{ marginTop: 10 }}>
            {problem === 'invalid' ? t('join.invalid') : t('join.rateLimited')}
          </Text>
        ) : null}

        {preview ? (
          <View style={styles.preview}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={preview.inviterName} color={Colors.tomato} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="small" color={Colors.muted} style={{ fontSize: 15 }}>
                  {t('join.invitedYou', { name: preview.inviterName })}
                </Text>
                <Text variant="heading" style={{ fontSize: 20 }}>
                  {preview.familyName}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text variant="label" style={styles.pill}>
                {t('join.members', { count: preview.memberCount })}
              </Text>
              <Text variant="label" style={styles.pill}>
                {t('join.recipes', { count: preview.recipeCount })}
              </Text>
            </View>
            <Button
              title={t('join.joinButton', { name: preview.familyName })}
              loading={busy}
              onPress={() => void join()}
            />
          </View>
        ) : null}

        <Text variant="small" color={Colors.muted} style={styles.footer}>
          {t('join.footer')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  codeInput: {
    height: 64,
    borderWidth: 2,
    borderColor: Colors.tomato,
    fontFamily: Fonts.bold,
    fontSize: 28,
    letterSpacing: 5,
  },
  preview: {
    marginTop: 24,
    borderRadius: Radius.card,
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 16,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    fontSize: 13,
  },
  footer: { marginTop: 'auto', paddingTop: 24, textAlign: 'center', fontSize: 14 },
});
