import { Host, Picker } from '@expo/ui';

export type SettingOption<T extends string> = { value: T; label: string };

/**
 * The value side of a settings row: tapping it opens the platform's own menu of options
 * (a Compose dropdown on Android). iOS has its own file to tint it.
 */
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
  return (
    <Host matchContents>
      <Picker selectedValue={value} onValueChange={(v) => onChange(v as T)} testID={label}>
        {options.map((o) => (
          <Picker.Item key={o.value} label={o.label} value={o.value} />
        ))}
      </Picker>
    </Host>
  );
}
