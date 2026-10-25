import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useColors } from '@/lib/appearance';

export default function AppTabs() {
  const { t } = useTranslation();
  const colors = useColors();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.saffronPill}
      tintColor={colors.tomato}
      iconColor={{ default: colors.muted, selected: colors.ink }}
      labelStyle={{ default: { color: colors.muted }, selected: { color: colors.ink } }}>
      <NativeTabs.Trigger name="week">
        <NativeTabs.Trigger.Label>{t('tabs.week')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="groceries">
        <NativeTabs.Trigger.Label>{t('tabs.groceries')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="basket" md="shopping_basket" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="recipes">
        <NativeTabs.Trigger.Label>{t('tabs.recipes')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="book" md="menu_book" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="family">
        <NativeTabs.Trigger.Label>{t('tabs.family')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" md="group" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
