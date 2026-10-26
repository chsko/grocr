import { Host } from '@expo/ui';
import { Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers';

import { useColors } from '@/lib/appearance';

import type { SettingOption } from './setting-picker';

/** The value side of a settings row: a SwiftUI menu picker, in the row's muted color. */
export function SettingPicker<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: SettingOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  const colors = useColors();
  return (
    <Host matchContents>
      <Picker
        selection={value}
        onSelectionChange={(v) => onChange(v as T)}
        testID={label}
        modifiers={[pickerStyle('menu'), tint(colors.muted)]}>
        {options.map((o) => (
          <Text key={o.value} modifiers={[tag(o.value)]}>
            {o.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
