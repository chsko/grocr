import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRight } from '@/components/icons';
import { Button, IconTile, Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/appearance';
import { EASE_OUT, sheetIn } from '@/lib/motion';
import { useMe } from '@/lib/session';
import { LATEST_WHATS_NEW, unseenEntries, type WhatsNewEntry } from '@/lib/whats-new';

/** Lets the first screen settle (splash fade, tab content) before the sheet rises. */
const OPEN_DELAY_MS = 700;

/** Cards arrive one after another, each a little after the last, rising a few points. */
const cardIn = (index: number) =>
  FadeInDown.delay(160 + index * 70)
    .duration(320)
    .easing(EASE_OUT);

/** One change: icon, title, a sentence or two, and "Show me" when it lives somewhere. */
export function WhatsNewCard({
  entry,
  index,
  isNew,
  onShow,
}: {
  entry: WhatsNewEntry;
  index: number;
  isNew?: boolean;
  onShow?: (entry: WhatsNewEntry) => void;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.card}>
      <IconTile icon={entry.icon} color={colors.tiles[index % colors.tiles.length]} size={44} />
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text variant="item" style={{ flexShrink: 1 }}>
            {t(`whatsNew.entries.${entry.key}.title`)}
          </Text>
          {isNew ? (
            <Text variant="label" color={colors.saffronInk} style={styles.newPill}>
              {t('whatsNew.unseen')}
            </Text>
          ) : null}
        </View>
        <Text variant="small" color={colors.muted} style={styles.body}>
          {t(`whatsNew.entries.${entry.key}.body`)}
        </Text>
        {entry.href && onShow ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('whatsNew.showMe')}: ${t(`whatsNew.entries.${entry.key}.title`)}`}
            hitSlop={12}
            onPress={() => onShow(entry)}
            style={({ pressed }) => [styles.showMe, pressed && { opacity: 0.6 }]}>
            <Text variant="label" color={colors.tomato}>
              {t('whatsNew.showMe')}
            </Text>
            <ChevronRight color={colors.tomato} size={14} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Opens a "Show me" target: tabs by switching to them, other screens on top. */
export function showEntry(entry: WhatsNewEntry) {
  if (!entry.href) return;
  void Haptics.selectionAsync().catch(() => {});
  router.navigate(entry.href);
}

/** The tabs themselves; anything pushed or presented over them keeps the sheet away. */
const TAB_PATHS = new Set(['/week', '/groceries', '/recipes', '/family']);

/**
 * Rises by itself once after an update that brought entries this member hasn't seen (GRO-66).
 * Closing it in any way records them as seen on the server, so other phones skip them too.
 * Members who haven't finished the get-started tour never see it: finishing the tour records
 * the newest entry in the same write, so the sheet starts out empty for them.
 */
export function WhatsNewSheet() {
  const { user } = useMe();
  // Mounted only once the tour is done, so the entries are read from the finished state.
  return user.tourDone ? <PendingSheet seen={user.whatsNewSeen} /> : null;
}

function PendingSheet({ seen }: { seen: number | null | undefined }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  // Frozen when it mounts, so the list doesn't empty as the server catches up.
  const [entries] = useState(() => unseenEntries(seen));

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Seen meanwhile (Family > What's new, another phone): don't bring them up again.
  const pending = entries.filter((e) => seen == null || e.n > seen);
  if (pending.length === 0 || closed || !ready || !TAB_PATHS.has(pathname)) return null;
  return <SheetBody entries={pending} onClosed={() => setClosed(true)} />;
}

function SheetBody({ entries, onClosed }: { entries: WhatsNewEntry[]; onClosed: () => void }) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const see = useMutation(api.users.seeWhatsNew);

  function close(then?: WhatsNewEntry) {
    void see({ upTo: LATEST_WHATS_NEW }).catch(() => undefined);
    onClosed();
    if (then) showEntry(then);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close()}>
      <Pressable
        style={styles.backdrop}
        accessibilityLabel={t('common.close')}
        onPress={() => close()}
      />
      <Animated.View entering={sheetIn} style={styles.sheetWrap}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text variant="heading" accessibilityRole="header">
              {t('whatsNew.sheetTitle')}
            </Text>
            <Text color={colors.muted}>{t('whatsNew.sheetIntro')}</Text>
          </View>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}>
            {entries.map((entry, index) => (
              <Animated.View key={entry.n} entering={cardIn(index)}>
                <WhatsNewCard entry={entry} index={index} onShow={(e) => close(e)} />
              </Animated.View>
            ))}
          </ScrollView>
          <Button title={t('whatsNew.done')} onPress={() => close()} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheetWrap: { maxHeight: '85%' },
  sheet: {
    backgroundColor: c.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
    flexShrink: 1,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: Radius.pill,
    backgroundColor: c.borderStrong,
  },
  header: { gap: 4 },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { gap: 18, paddingBottom: 4 },
  card: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  cardText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  body: { fontSize: 15, lineHeight: 21 },
  newPill: {
    backgroundColor: c.saffronPill,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    overflow: 'hidden',
    fontSize: 12,
    lineHeight: 18,
  },
  showMe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
}));
