// Reanimated 4.7 cannot initialise under Jest (its JS fallback throws on load), so screens get a
// stand-in: Animated.View renders a plain View and layout animations are inert builders.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const builder = new Proxy({}, { get: () => () => builder });
  return {
    __esModule: true,
    default: { View },
    FadeInLeft: builder,
    FadeInRight: builder,
  };
});
