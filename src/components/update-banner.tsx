import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';

import { Close } from '@/components/icons';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/appearance';
import { claimAnnouncement, dismissUpdate, useDismissedUpdate } from '@/lib/updates';

/**
 * A slim row at the top of each tab once a new version has downloaded: tap to reload into it,
 * or close it and get the new version on the next start. It sits in the layout rather than
 * floating, so it never covers a header button, and it never reloads on its own, so nobody
 * loses what they were typing. Renders nothing in Expo Go and dev, where expo-updates is off.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const { isUpdatePending, downloadedUpdate } = Updates.useUpdates();
  const dismissed = useDismissedUpdate();
  const [reloading, setReloading] = useState(false);

  const key = downloadedUpdate?.updateId ?? 'rollback';
  const visible = Updates.isEnabled && isUpdatePending && dismissed !== key;

  useEffect(() => {
    if (visible && claimAnnouncement(key)) {
      AccessibilityInfo.announceForAccessibility(t('update.ready'));
    }
  }, [visible, key, t]);

  if (!visible) return null;

  const reload = async () => {
    setReloading(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setReloading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('update.ready')}, ${t('update.action')}`}
          disabled={reloading}
          onPress={reload}
          style={({ pressed }) => [styles.main, (pressed || reloading) && { opacity: 0.7 }]}>
          <Text style={[styles.label, styles.shrink, { color: colors.saffronInk }]}>
            {t('update.ready')}
          </Text>
          <Text style={[styles.label, { color: colors.tomato }]}>{t('update.action')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('update.later')}
          hitSlop={8}
          onPress={() => dismissUpdate(key)}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
          <Close size={16} color={colors.saffronInk} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: Spacing.two,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.saffronSoft,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: c.saffronPill,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    minHeight: 44,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  // Same as the shared Text's label variant; ui.tsx renders this banner, so no import back.
  label: { fontFamily: Fonts.semibold, fontSize: 14, lineHeight: 20 },
  shrink: { flexShrink: 1 },
  close: {
    marginLeft: Spacing.two,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
