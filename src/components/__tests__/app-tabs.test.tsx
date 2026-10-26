import { Animated, Dimensions } from 'react-native';

import { forSlide } from '@/components/app-tabs';

const slideAt = (progress: number) => {
  const { sceneStyle } = forSlide({ current: { progress: new Animated.Value(progress) } });
  const [{ translateX }] = sceneStyle.transform;
  return (translateX as unknown as { __getValue: () => number }).__getValue();
};

test('the tab you leave slides out and the one you tap slides in, in tab order', () => {
  const width = Dimensions.get('window').width;
  expect(slideAt(0)).toBe(0);
  // Left of the shown tab sits off the left edge, right of it off the right edge.
  expect(slideAt(-1)).toBe(-width);
  expect(slideAt(1)).toBe(width);
  expect(slideAt(0.5)).toBe(width / 2);
});
