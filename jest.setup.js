// Reanimated 4.7 cannot initialise under Jest (its JS fallback throws on load), so screens get a
// stand-in: Animated.View renders a plain View and layout animations are inert builders.
// Shared values are plain refs, timings jump to their target, and an animated style reads its
// shared values whenever the style is looked at, so tests see the latest value.
jest.mock('react-native-reanimated', () => {
  const { useRef } = require('react');
  const { View } = require('react-native');
  const builder = new Proxy({}, { get: () => () => builder });
  const live = (fn) =>
    new Proxy(
      {},
      {
        get: (_, k) => fn()[k],
        ownKeys: () => Reflect.ownKeys(fn()),
        getOwnPropertyDescriptor: (_, k) => ({
          value: fn()[k],
          enumerable: true,
          configurable: true,
        }),
      },
    );
  return {
    __esModule: true,
    default: { View },
    FadeInLeft: builder,
    FadeInRight: builder,
    Easing: { out: (e) => e, quad: (t) => t },
    ReduceMotion: { System: 'system' },
    useSharedValue: (v) => useRef({ value: v }).current,
    useAnimatedStyle: live,
    withTiming: (v) => v,
    withDelay: (_, v) => v,
  };
});
