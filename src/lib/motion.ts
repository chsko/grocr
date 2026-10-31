import {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  SlideInDown,
} from 'react-native-reanimated';

// Shared motion for lists and sheets: short, ease-out, transform and opacity only.
// Fades explain what changed, so they still play with Reduce Motion on; movement (rows sliding
// into place, sheets sliding up) follows the system setting and is skipped there.

/** Strong ease-out for things entering or leaving. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** For things moving on screen. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** A row or card leaving a list. */
export const fadeOut = FadeOut.duration(180).reduceMotion(ReduceMotion.Never);
/** A row or card arriving in a list that is already on screen. */
export const fadeIn = FadeIn.duration(200).reduceMotion(ReduceMotion.Never);
/** The rows around a change sliding into their new place. */
export const reflow = LinearTransition.duration(220).easing(EASE_IN_OUT);

/** iOS sheet curve. */
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

/**
 * A bottom sheet rising into place. Its Modal fades the dim backdrop in, so only the sheet
 * moves; with Reduce Motion on the sheet just fades in with the backdrop.
 */
export const sheetIn = SlideInDown.duration(280).easing(EASE_SHEET);
