import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Text } from '@/components/ui';
import { makeStyles } from '@/lib/appearance';
import { attempt } from '@/lib/errors';
import { sheetIn } from '@/lib/motion';

/** A bottom sheet over a dimmed screen, for one small edit. */
export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const styles = useStyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('common.close')} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={sheetIn}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One text field and Save, for a name. */
export function NameSheet({
  title,
  label,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  initial: string;
  onSave: (name: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (name.trim() === '') return;
    if (name.trim() !== initial) {
      setBusy(true);
      const ok = await attempt(t, () => onSave(name).then(() => true));
      setBusy(false);
      if (!ok) return;
    }
    onClose();
  }
  return (
    <Sheet onClose={onClose}>
      <Text variant="heading">{title}</Text>
      <Field
        label={label}
        value={name}
        onChangeText={setName}
        maxLength={60}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      <Button
        title={t('common.save')}
        loading={busy}
        disabled={name.trim() === ''}
        onPress={() => void save()}
      />
    </Sheet>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 14,
  },
}));
