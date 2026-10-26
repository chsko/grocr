import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Dimensions, Easing, Platform, Pressable, Text, View } from 'react-native';
import Reanimated, {
  Easing as REasing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Basket, Book, Calendar, Person } from '@/components/icons';
import { Fonts, Radius } from '@/constants/theme';
import { makeStyles, useColors } from '@/lib/appearance';

/**
 * Tabs slide like pages: the tab you leave slides out and the one you tap slides in, in tab
 * order (tapping a tab to the right moves the screens left). Progress is -1 left of the shown
 * tab, 0 shown, 1 right of it.
 */
export function forSlide({
  current,
}: {
  current: { progress: Animated.AnimatedInterpolation<number> };
}) {
  const width = Dimensions.get('window').width;
  return {
    sceneStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width],
          }),
        },
      ],
    },
  };
}

const SLIDE_MS = 280;

const slideSpec = {
  animation: 'timing' as const,
  config: { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) },
};

// The same symbols the native tab bar used; the stroke icons stand in where SF Symbols don't exist.
const tabIcons: Record<string, { sf: SFSymbol; Fallback: typeof Calendar }> = {
  week: { sf: 'calendar', Fallback: Calendar },
  groceries: { sf: 'basket', Fallback: Basket },
  recipes: { sf: 'book', Fallback: Book },
  family: { sf: 'person.2', Fallback: Person },
};

const ios = Platform.OS === 'ios';
const BAR_HEIGHT = ios ? 62 : 80;
const CAPSULE_PADDING = 4;

/** Where the floating bar sits above the screen's bottom edge. */
function barBottom(insetBottom: number) {
  return ios ? Math.max(insetBottom - 9, 12) : 0;
}

/**
 * Room a tab's scrolling content leaves at the bottom so its end isn't hidden under the bar. On
 * iOS the scroll view already insets itself by the bottom safe area, so that part is left out.
 */
export function useTabBarSpace() {
  const { bottom } = useSafeAreaInsets();
  return ios ? barBottom(bottom) + BAR_HEIGHT + 8 - bottom : BAR_HEIGHT + bottom;
}

/**
 * Drawn by the app so tab switches can slide, made to look like the native bar it replaced: on
 * iOS a floating Liquid Glass capsule (a plain frosted capsule before iOS 26), on Android a flat
 * Material bar with the saffron pill behind the selected icon.
 */
/**
 * The lighter capsule behind the selected tab. It slides to the tapped tab in step with the
 * page slide; Reduce Motion moves it at once.
 */
function SelectedHighlight({
  index,
  count,
  width,
}: {
  index: number;
  count: number;
  width: number;
}) {
  const styles = useStyles();
  const itemWidth = (width - CAPSULE_PADDING * 2) / count;
  const x = useSharedValue(index * itemWidth);
  const placed = useRef(false);

  useEffect(() => {
    if (!itemWidth) return;
    const to = index * itemWidth;
    // The first measured layout puts it in place; only later tab changes slide.
    x.value = placed.current
      ? withTiming(to, {
          duration: SLIDE_MS,
          easing: REasing.out(REasing.cubic),
          reduceMotion: ReduceMotion.System,
        })
      : to;
    placed.current = true;
  }, [index, itemWidth, x]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (!itemWidth) return null;
  return <Reanimated.View style={[styles.highlight, { width: itemWidth }, slide]} />;
}

function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [capsuleWidth, setCapsuleWidth] = useState(0);
  const colors = useColors();
  const styles = useStyles();
  const glass = ios && isLiquidGlassAvailable();

  const items = state.routes.map((route, index) => {
    const focused = index === state.index;
    const { options } = descriptors[route.key];
    const label = options.title ?? route.name;
    const icon = tabIcons[route.name];
    const color = focused ? colors.ink : colors.muted;
    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };
    return (
      <Pressable
        key={route.key}
        role="tab"
        aria-selected={focused}
        accessibilityLabel={label}
        onPress={onPress}
        onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
        style={styles.item}>
        <View style={[styles.iconWrap, !ios && focused && styles.pill]}>
          {icon ? (
            <SymbolView
              name={icon.sf}
              type="monochrome"
              tintColor={color}
              size={ios ? 24 : 22}
              fallback={<icon.Fallback size={22} color={color} />}
            />
          ) : null}
        </View>
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  });

  if (!ios) {
    return (
      <View style={[styles.android, { paddingBottom: insets.bottom }]} role="tablist">
        {items}
      </View>
    );
  }
  const measure = (e: { nativeEvent: { layout: { width: number } } }) =>
    setCapsuleWidth(e.nativeEvent.layout.width);
  const highlight = (
    <SelectedHighlight index={state.index} count={state.routes.length} width={capsuleWidth} />
  );
  return (
    <View
      pointerEvents="box-none"
      style={[styles.floating, { bottom: barBottom(insets.bottom) }]}
      role="tablist">
      {glass ? (
        <GlassView glassEffectStyle="regular" style={styles.capsule} onLayout={measure}>
          {highlight}
          {items}
        </GlassView>
      ) : (
        <View style={[styles.capsule, styles.frosted]} onLayout={measure}>
          {highlight}
          {items}
        </View>
      )}
    </View>
  );
}

export default function AppTabs() {
  const { t } = useTranslation();
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      // Detaching the tabs you're not on raced the slide and sometimes left a blank tab, so all
      // four stay attached; the slide keeps the hidden ones a screen-width off to the side.
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        // Mount every tab up front, as the native tabs did, so a first visit slides in with content.
        lazy: false,
        animation: reduceMotion ? 'none' : 'shift',
        sceneStyleInterpolator: forSlide,
        transitionSpec: slideSpec,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="week" options={{ title: t('tabs.week') }} />
      <Tabs.Screen name="groceries" options={{ title: t('tabs.groceries') }} />
      <Tabs.Screen name="recipes" options={{ title: t('tabs.recipes') }} />
      <Tabs.Screen name="family" options={{ title: t('tabs.family') }} />
    </Tabs>
  );
}

const useStyles = makeStyles((colors) => ({
  floating: { position: 'absolute', left: 21, right: 21, height: BAR_HEIGHT },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CAPSULE_PADDING,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  frosted: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  android: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    height: ios ? BAR_HEIGHT - 8 : BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: ios ? 1 : 4,
    borderRadius: Radius.pill,
  },
  // The lighter capsule iOS 26 draws behind the selected tab.
  highlight: {
    position: 'absolute',
    left: CAPSULE_PADDING,
    top: CAPSULE_PADDING,
    bottom: CAPSULE_PADDING,
    borderRadius: Radius.pill,
    backgroundColor: colors.divider,
  },
  iconWrap: {
    width: 64,
    height: ios ? 28 : 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  pill: { backgroundColor: colors.saffronPill },
  label: ios
    ? { fontSize: 10, fontWeight: '600' }
    : { fontFamily: Fonts.semibold, fontSize: 12, lineHeight: 16 },
}));
