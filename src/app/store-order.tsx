import { useMutation } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ChevronDown, ChevronUp } from '@/components/icons';
import { Button, IconButton, Text } from '@/components/ui';
import { Colors, Radius } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import { SECTIONS, type Section } from '@/convex/lib/catalog';
import { attempt } from '@/lib/errors';
import { useFamily } from '@/lib/session';

/** The family arranges grocery list sections in the order they walk through their store. */
export default function StoreOrderScreen() {
  const { t } = useTranslation();
  const family = useFamily();
  const setSectionOrder = useMutation(api.groups.setSectionOrder);
  // The family's live order, or a move still being saved so it shows at once. When the save
  // ends (or fails) the screen goes back to the server's order, including other members' moves.
  const [pending, setPending] = useState<Section[] | null>(null);
  const order = pending ?? family.sectionOrder;

  async function save(next: Section[]) {
    setPending(next);
    await attempt(t, () => setSectionOrder({ groupId: family.groupId, order: next }));
    setPending(null);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    void save(next);
  }

  const isDefault = order.every((s, i) => s === SECTIONS[i]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: Colors.background }}
      contentContainerStyle={styles.content}>
      <Text color={Colors.muted}>{t('storeOrder.intro')}</Text>
      <View style={styles.list}>
        {order.map((section, index) => {
          const name = t(`sections.${section}`);
          return (
            <View key={section} style={[styles.row, index > 0 && styles.divider]}>
              <Text variant="label" color={Colors.muted} style={styles.number}>
                {index + 1}
              </Text>
              <Text variant="item" style={{ flex: 1 }}>
                {name}
              </Text>
              <IconButton
                label={t('storeOrder.up', { section: name })}
                disabled={index === 0}
                onPress={() => move(index, -1)}>
                <ChevronUp color={index === 0 ? Colors.checkbox : Colors.ink} />
              </IconButton>
              <IconButton
                label={t('storeOrder.down', { section: name })}
                disabled={index === order.length - 1}
                onPress={() => move(index, 1)}>
                <ChevronDown color={index === order.length - 1 ? Colors.checkbox : Colors.ink} />
              </IconButton>
            </View>
          );
        })}
      </View>
      {isDefault ? null : (
        <Button
          kind="ghost"
          title={t('storeOrder.reset')}
          onPress={() => void save([...SECTIONS])}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  list: { borderRadius: Radius.card, backgroundColor: Colors.surface, paddingHorizontal: 14 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: Colors.divider },
  number: { width: 20, textAlign: 'center' },
});
