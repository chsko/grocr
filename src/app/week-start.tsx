import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView } from 'react-native';

import { Check } from '@/components/icons';
import { Text } from '@/components/ui';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { useFamily } from '@/lib/session';
import type { Weekday } from '@/lib/week';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** Listed from Monday, as on Norwegian calendars. */
const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * Which day the family's weeks start on (GRO-72). One setting for the whole family; changing
 * it moves the grocery lists to the new weeks, so it asks first.
 */
export default function WeekStartScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { t } = useTranslation();
  const family = useFamily();
  const setWeekStart = useMutation(api.groups.setWeekStart);

  function pick(day: Weekday) {
    if (day === family.weekStartsOn) return;
    const name = t(`dates.dayLong.${DAY_KEYS[day]}`);
    Alert.alert(t('weekStart.confirmTitle', { day: name }), t('weekStart.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('weekStart.confirm'),
        onPress: async () => {
          const done = await attempt(t, () =>
            setWeekStart({ groupId: family.groupId, weekStartsOn: day }),
          );
          if (done !== undefined && router.canGoBack()) router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={colors.muted} style={{ marginBottom: 8 }}>
        {t('weekStart.intro')}
      </Text>
      {ORDER.map((day, index) => {
        const selected = day === family.weekStartsOn;
        return (
          <Pressable
            key={day}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => pick(day)}
            style={({ pressed }) => [
              styles.row,
              index === ORDER.length - 1 && { borderBottomWidth: 0 },
              pressed && { opacity: 0.6 },
            ]}>
            <Text variant="item">{t(`dates.dayLong.${DAY_KEYS[day]}`)}</Text>
            {selected ? <Check color={colors.tomato} size={20} strokeWidth={2.6} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  content: { padding: 20, paddingBottom: 48 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
}));
