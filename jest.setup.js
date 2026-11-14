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
    FadeIn: builder,
    FadeOut: builder,
    FadeInDown: builder,
    FadeInLeft: builder,
    FadeInRight: builder,
    LinearTransition: builder,
    SlideInDown: builder,
    ZoomIn: builder,
    LayoutAnimationConfig: ({ children }) => children,
    Easing: { out: (e) => e, quad: (t) => t, cubic: (t) => t, bezier: () => (t) => t },
    ReduceMotion: { System: 'system', Never: 'never', Always: 'always' },
    useSharedValue: (v) => useRef({ value: v }).current,
    useAnimatedStyle: live,
    withTiming: (v) => v,
    useReducedMotion: () => false,
    withDelay: (_, v) => v,
    withSequence: (...steps) => steps[steps.length - 1],
    withSpring: (v) => v,
  };
});

// Gesture Handler needs real Reanimated, which Jest doesn't have (see above). Screens get plain
// views and inert gestures; drags are checked in the app, taps work as usual.
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }) => children,
    usePanGesture: () => ({}),
  };
});
