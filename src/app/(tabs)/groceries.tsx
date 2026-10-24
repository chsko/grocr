import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { defaultGroceryWeek, isoWeekNumber, todayIn } from '@/lib/week';

export default function GroceriesScreen() {
  const { t } = useTranslation();
  // The family timezone replaces the device timezone once groups exist (GRO-24).
  const week = defaultGroceryWeek(todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone));

  return (
    <PlaceholderScreen title={t('groceries.title')} message={t('groceries.empty')}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('dates.weekNumber', { week: isoWeekNumber(week.startDate) })}
      </ThemedText>
    </PlaceholderScreen>
  );
}
