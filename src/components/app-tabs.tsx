import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const { t } = useTranslation();

  return (
    <NativeTabs
      backgroundColor={Colors.background}
      indicatorColor={Colors.saffronPill}
      tintColor={Colors.tomato}
      iconColor={{ default: Colors.muted, selected: Colors.ink }}
      labelStyle={{ default: { color: Colors.muted }, selected: { color: Colors.ink } }}>
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
