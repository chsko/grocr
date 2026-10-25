import { useMutation, useQuery } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Share as RNShare, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Book, Close, Clock, Person, Share } from '@/components/icons';
import { Button, IconButton, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { useFamily } from '@/lib/session';

/** Shows the family's invite code, creating one if none is active (GRO-25). Owner only. */
export default function InviteScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const family = useFamily();
  const active = useQuery(api.invites.active, { groupId: family.groupId });
  const create = useMutation(api.invites.create);
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (active === null && !requested.current && family.role === 'owner') {
      requested.current = true;
      void attempt(t, () => create({ groupId: family.groupId }));
    }
  }, [active, create, family, t]);

  const code = active ? `${active.code.slice(0, 3)} ${active.code.slice(3)}` : null;

  async function share() {
    if (!code) return;
    await RNShare.share({ message: t('invite.shareMessage', { family: family.name, code }) });
  }

  async function copy() {
    if (!active) return;
    await Clipboard.setStringAsync(active.code);
    setCopied(true);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <IconButton
        label={t('common.close')}
        style={{ alignSelf: 'flex-end', marginRight: -10 }}
        onPress={() => router.back()}>
        <Close />
      </IconButton>
      <Text variant="title">{t('invite.title', { family: family.name })}</Text>
      <Text color={colors.muted} style={{ marginTop: 10 }}>
        {t('invite.intro')}
      </Text>

      <View style={styles.codeCard}>
        <Text variant="label" color={colors.muted}>
          {t('invite.codeLabel')}
        </Text>
        {code ? (
          <Text selectable style={styles.code}>
            {code}
          </Text>
        ) : (
          <ActivityIndicator color={colors.tomato} style={{ height: 48 }} />
        )}
      </View>

      <View style={{ marginTop: 20, gap: 12 }}>
        <Button
          title={t('invite.share')}
          icon={<Share color={colors.onTomato} size={20} />}
          disabled={!code}
          onPress={() => void share()}
        />
        <Button
          kind="secondary"
          title={copied ? t('invite.copied') : t('invite.copy')}
          disabled={!code}
          onPress={() => void copy()}
        />
      </View>

      <View style={{ marginTop: 28, gap: 12 }}>
        {[
          { icon: <Clock color={colors.tomato} size={18} />, text: t('invite.factExpiry') },
          { icon: <Person color={colors.tomato} size={18} />, text: t('invite.factMembers') },
          { icon: <Book color={colors.tomato} size={18} />, text: t('invite.factEdit') },
        ].map((fact) => (
          <View key={fact.text} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ marginTop: 3 }}>{fact.icon}</View>
            <Text color={colors.muted} style={{ flex: 1, fontSize: 15 }}>
              {fact.text}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { paddingHorizontal: 24, paddingTop: 16 },
  codeCard: {
    marginTop: 28,
    borderRadius: Radius.card,
    backgroundColor: colors.surface,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  code: {
    fontFamily: Fonts.bold,
    fontSize: 38,
    lineHeight: 46,
    letterSpacing: 6,
    color: colors.ink,
  },
}));
