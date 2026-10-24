import { useMutation } from 'convex/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Field, Text } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { SECTIONS } from '@/convex/lib/catalog';
import type { GroceryLine } from '@/convex/lib/merge';
import { formatQty, parseQty, UNITS, type Unit } from '@/convex/lib/units';
import { attempt } from '@/lib/errors';

/**
 * Edit or remove a merged grocery line (long press). Saving puts the new amount on one row and
 * marks it edited, so planning changes leave it alone (Product plan §5.3).
 */
export function GroceryLineEditor({ line, onClose }: { line: GroceryLine; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const editMerged = useMutation(api.grocery.editMerged);
  const remove = useMutation(api.grocery.remove);
  const setSection = useMutation(api.ingredients.setSection);
  // Lines with mixed units ("1 can + 200 g") start from the first part.
  const first = line.amounts[0];
  const [qty, setQty] = useState(() =>
    first?.qty !== undefined ? formatQty(first.qty, i18n.language) : '',
  );
  const [unit, setUnit] = useState<Unit | undefined>(first?.unit);
  const itemIds = line.itemIds as Id<'groceryItems'>[];

  async function save() {
    await attempt(t, () => editMerged({ itemIds, qty: parseQty(qty), unit }));
    onClose();
  }

  async function removeLine() {
    await attempt(t, () => remove({ itemIds }));
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text variant="heading">{line.name}</Text>
          <Field
            label={t('groceries.amount')}
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            placeholder="1"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}>
            <Chip
              title={t('units.none')}
              selected={unit === undefined}
              onPress={() => setUnit(undefined)}
            />
            {UNITS.map((u) => (
              <Chip
                key={u}
                title={t(`units.${u}`)}
                selected={unit === u}
                onPress={() => setUnit(u)}
              />
            ))}
          </ScrollView>
          {line.ingredientId ? (
            <>
              <Text variant="label" color={Colors.muted}>
                {t('groceries.section')}
              </Text>
              <View style={styles.sections}>
                {SECTIONS.map((s) => (
                  <Chip
                    key={s}
                    title={t(`sections.${s}`)}
                    selected={line.section === s}
                    onPress={() =>
                      void attempt(t, () =>
                        setSection({
                          ingredientId: line.ingredientId as Id<'ingredients'>,
                          section: s,
                        }),
                      )
                    }
                  />
                ))}
              </View>
            </>
          ) : null}
          <Button title={t('common.save')} onPress={() => void save()} />
          <Button
            kind="danger"
            title={t('groceries.removeLine')}
            style={{ alignSelf: 'center' }}
            onPress={() => void removeLine()}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay },
  sections: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
});
