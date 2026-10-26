import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TabStack, useHeaderOptions } from '@/components/tab-stack';

export const unstable_settings = { anchor: 'index' };

export default function FamilyStack() {
  const { t } = useTranslation();
  const header = useHeaderOptions();
  return (
    <TabStack largeTitle>
      <Stack.Screen name="sections" options={{ ...header, title: t('storeOrder.title') }} />
    </TabStack>
  );
}
