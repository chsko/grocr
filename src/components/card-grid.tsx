import { Children, isValidElement, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

const GAP = 20;

/**
 * Cards side by side in as many even columns as fit (at least `min` wide each), for the website
 * on a big screen. Rows keep their own height, like a list read left to right.
 */
export function CardGrid({ min = 320, children }: { min?: number; children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const columns = Math.max(1, Math.floor((width + GAP) / (min + GAP)));
  const item: StyleProp<ViewStyle> = { width: (width - GAP * (columns - 1)) / columns };
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'flex-start' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0
        ? Children.toArray(children).map((child, i) => (
            <View key={isValidElement(child) && child.key !== null ? child.key : i} style={item}>
              {child}
            </View>
          ))
        : null}
    </View>
  );
}
