import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Basket, Book, Calendar, Check, ChevronRight, Plus } from '@/components/icons';
import { Avatar, IconTile, Text } from '@/components/ui';
import { Fonts, Radius } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/appearance';

// Small drawings of the real screens for the get-started tour (GRO-49). They use the same
// tokens as the screens, so they follow light and dark, and sample text in the app language.

export type TourScene = 'loop' | 'recipes' | 'week' | 'groceries' | 'family';

export function TourSceneView({ scene, height }: { scene: TourScene; height: number }) {
  const styles = useStyles();
  return (
    // Decoration only: the page's title and text say the same to screen readers.
    <View
      style={[styles.frame, { height }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {scene === 'loop' ? <Loop /> : null}
      {scene === 'recipes' ? <Recipes /> : null}
      {scene === 'week' ? <Week /> : null}
      {scene === 'groceries' ? <Groceries /> : null}
      {scene === 'family' ? <Family /> : null}
    </View>
  );
}

function Loop() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const steps = [
    { label: t('tabs.recipes'), icon: <Book color={colors.tomato} size={26} /> },
    { label: t('tabs.week'), icon: <Calendar color={colors.tomato} size={26} /> },
    { label: t('tabs.groceries'), icon: <Basket color={colors.tomato} size={26} /> },
  ];
  return (
    <View style={styles.loop}>
      {steps.map((step, index) => (
        <View key={step.label} style={styles.loopRow}>
          {index > 0 ? <ChevronRight color={colors.muted} size={18} strokeWidth={2.2} /> : null}
          <View style={styles.loopStep}>
            <View style={styles.loopIcon}>{step.icon}</View>
            <Text variant="label" numberOfLines={1} style={{ fontSize: 13 }}>
              {step.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Recipes() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const rows = [
    { icon: '🌮', title: t('tour.sample.tacos'), count: 5 },
    { icon: '🐟', title: t('tour.sample.fishSoup'), count: 6 },
  ];
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.titleRow}>
        <Text variant="heading">{t('tabs.recipes')}</Text>
        <View style={styles.plus}>
          <Plus color={colors.onTomato} size={18} strokeWidth={2.4} />
        </View>
      </View>
      {rows.map((row, index) => (
        <View key={row.title} style={styles.row}>
          <IconTile icon={row.icon} color={colors.tiles[index % colors.tiles.length]} size={38} />
          <View style={{ flex: 1 }}>
            <Text variant="item" style={{ fontSize: 16 }}>
              {row.title}
            </Text>
            <Text variant="small" color={colors.muted}>
              {t('tour.sample.ingredients', { count: row.count })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Week() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const days = [
    { day: 'mon', date: 3, icon: '🌮', title: t('tour.sample.tacos') },
    { day: 'tue', date: 4, icon: '🐟', title: t('tour.sample.fishSoup') },
    { day: 'wed', date: 5, icon: null, title: null },
  ] as const;
  return (
    <View style={{ gap: 8 }}>
      {days.map((d, index) => (
        <View key={d.day} style={[styles.day, d.title === null && styles.dayEmpty]}>
          <View style={styles.dateTile}>
            <Text
              variant="small"
              color={colors.muted}
              style={{ fontFamily: Fonts.semibold, fontSize: 10, lineHeight: 13 }}>
              {t(`dates.dayShort.${d.day}`).toLocaleUpperCase()}
            </Text>
            <Text variant="item" style={{ fontFamily: Fonts.bold, fontSize: 16, lineHeight: 19 }}>
              {d.date}
            </Text>
          </View>
          {d.title ? (
            <>
              <Text variant="item" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>
                {d.title}
              </Text>
              <IconTile icon={d.icon} color={colors.tiles[index]} size={28} />
            </>
          ) : (
            <Text variant="item" color={colors.tomato} style={{ flex: 1, fontSize: 15 }}>
              {t('week.addDinner')}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function Groceries() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const from = `${t('tour.sample.tacos')} (${t('dates.dayShort.mon')})`;
  const lines = [
    { name: t('tour.sample.tomatoes'), amount: '3', checked: false },
    { name: t('tour.sample.beef'), amount: '400 g', checked: false },
    { name: t('tour.sample.tortillas'), amount: '8', checked: true },
  ];
  return (
    <View>
      <Text variant="section" color={colors.muted} style={{ marginBottom: 2 }}>
        {t('tabs.groceries')}
      </Text>
      {lines.map((line) => (
        <View key={line.name} style={styles.line}>
          {line.checked ? (
            <View style={styles.boxOn}>
              <Check color={colors.onTomato} size={13} strokeWidth={3} />
            </View>
          ) : (
            <View style={styles.box} />
          )}
          <View style={{ flex: 1 }}>
            <Text
              variant="item"
              color={line.checked ? colors.muted : colors.ink}
              style={[{ fontSize: 16 }, line.checked && { textDecorationLine: 'line-through' }]}>
              {line.name}
            </Text>
            {line.checked ? null : (
              <Text variant="small" color={colors.muted}>
                {from}
              </Text>
            )}
          </View>
          <Text variant="item" color={line.checked ? colors.muted : colors.ink}>
            {line.amount}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Family() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useStyles();
  const people = ['Kari', 'Ola', 'Emma', 'Jonas'];
  return (
    <View style={{ gap: 18, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row' }}>
        {people.map((name, index) => (
          <View key={name} style={[styles.avatarRing, index > 0 && { marginLeft: -10 }]}>
            <Avatar name={name} color={colors.avatars[index % colors.avatars.length]} size={48} />
          </View>
        ))}
      </View>
      <View style={styles.toast}>
        <View style={styles.boxOn}>
          <Check color={colors.onTomato} size={13} strokeWidth={3} />
        </View>
        <Text variant="label" style={{ flexShrink: 1 }}>
          {t('tour.sample.ticked')}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  frame: {
    borderRadius: Radius.card,
    backgroundColor: colors.saffronTint,
    padding: 18,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  loop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loopRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loopStep: { alignItems: 'center', gap: 8, width: 76 },
  loopIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  plus: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.tomatoFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 14,
    backgroundColor: colors.raised,
  },
  day: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    padding: 6,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dayEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dashed },
  dateTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  box: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.checkbox },
  boxOn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.tomatoFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: { borderRadius: 30, borderWidth: 3, borderColor: colors.saffronTint },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: colors.raised,
  },
}));
