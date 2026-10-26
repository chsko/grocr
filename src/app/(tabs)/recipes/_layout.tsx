import { Stack } from 'expo-router';

import { TabStack, useHeaderOptions } from '@/components/tab-stack';

// A link straight to a recipe still has the list to go back to.
export const unstable_settings = { anchor: 'index' };

export default function RecipesStack() {
  const header = useHeaderOptions();
  return (
    <TabStack largeTitle>
      <Stack.Screen name="[id]" options={{ ...header, title: '' }} />
    </TabStack>
  );
}
