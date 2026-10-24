import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';

// Small building blocks shared by the screens, styled after the design canvas.

const variants = StyleSheet.create({
  display: { fontFamily: Fonts.bold, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  title: { fontFamily: Fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  heading: { fontFamily: Fonts.bold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: Fonts.regular, fontSize: 17, lineHeight: 25 },
  item: { fontFamily: Fonts.semibold, fontSize: 17, lineHeight: 22 },
  label: { fontFamily: Fonts.semibold, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: Fonts.regular, fontSize: 13, lineHeight: 18 },
  section: {
    fontFamily: Fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

type Variant = keyof typeof variants;

export function Text({
  variant = 'body',
  color = Colors.ink,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  return <RNText style={[variants[variant], { color }, style]} {...rest} />;
}

type ButtonKind = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger';

export function Button({
  title,
  kind = 'primary',
  loading,
  disabled,
  icon,
  style,
  ...rest
}: PressableProps & {
  title: string;
  kind?: ButtonKind;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const fg =
    kind === 'primary' || kind === 'dark'
      ? '#FFFFFF'
      : kind === 'ghost' || kind === 'danger'
        ? kind === 'danger'
          ? Colors.danger
          : Colors.tomato
        : Colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: Colors.tomato },
        kind === 'dark' && { backgroundColor: Colors.ink },
        kind === 'secondary' && styles.secondary,
        (kind === 'ghost' || kind === 'danger') && styles.ghost,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon}
          <Text variant="item" color={fg}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  children,
  filled,
  outlined,
  style,
  ...rest
}: PressableProps & {
  label: string;
  filled?: boolean;
  outlined?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        filled && { backgroundColor: Colors.tomato },
        outlined && { borderWidth: 1.5, borderColor: Colors.borderStrong },
        pressed && { opacity: 0.7 },
        style,
      ]}
      {...rest}>
      {children}
    </Pressable>
  );
}

export function Field({
  label,
  style,
  inputStyle,
  ...rest
}: TextInputProps & {
  label?: string;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  const input = (
    <TextInput
      placeholderTextColor={Colors.checkbox}
      style={[styles.input, inputStyle]}
      accessibilityLabel={label}
      {...rest}
    />
  );
  if (!label) return <View style={style}>{input}</View>;
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text variant="label" color={Colors.muted}>
        {label}
      </Text>
      {input}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 50,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.stepper}>
      <IconButton
        label={t('common.fewer')}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}>
        <Text variant="heading" color={value <= min ? Colors.checkbox : Colors.ink}>
          −
        </Text>
      </IconButton>
      <Text variant="item" style={{ minWidth: 24, textAlign: 'center' }}>
        {value}
      </Text>
      <IconButton
        label={t('common.more')}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}>
        <Text variant="heading" color={value >= max ? Colors.checkbox : Colors.ink}>
          +
        </Text>
      </IconButton>
    </View>
  );
}

export function Chip({
  title,
  dashed,
  selected,
  ...rest
}: PressableProps & { title: string; dashed?: boolean; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        dashed && { borderStyle: 'dashed', borderColor: Colors.dashed },
        selected && { backgroundColor: Colors.saffronSoft, borderColor: Colors.saffronSoft },
        pressed && { opacity: 0.7 },
      ]}
      {...rest}>
      <Text variant="label" color={dashed ? Colors.tomato : Colors.ink} style={{ fontSize: 15 }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** A soft square with the first letter of a name, used for recipes and dinners. */
export function InitialTile({
  name,
  color,
  size = 46,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text variant="item" style={{ fontFamily: Fonts.bold, fontSize: 18 }}>
        {name.charAt(0).toLocaleUpperCase()}
      </Text>
    </View>
  );
}

export function Avatar({ name, color, size = 42 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text variant="item" color="#FFFFFF" style={{ fontFamily: Fonts.bold }}>
        {(name.charAt(0) || '?').toLocaleUpperCase()}
      </Text>
    </View>
  );
}

export function Loading() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.background,
      }}>
      <ActivityIndicator color={Colors.tomato} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: Radius.button,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondary: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
  },
  ghost: { minHeight: 44, paddingHorizontal: 0, alignSelf: 'flex-start' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 50,
    borderRadius: Radius.field,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 14,
    fontFamily: Fonts.medium,
    fontSize: 17,
    color: Colors.ink,
    backgroundColor: Colors.background,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.field,
    backgroundColor: Colors.surface,
  },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
});

/** A scrolling tab screen below the status bar; iOS insets it above the native tab bar. */
export function TabScreen({
  children,
  header,
  contentStyle,
}: {
  children: React.ReactNode;
  header?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: 32 }, contentStyle]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
