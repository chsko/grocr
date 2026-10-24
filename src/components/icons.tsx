import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Colors } from '@/constants/theme';

// Stroke icons from the design canvas, drawn on a 24px grid.

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function Stroke({
  size = 22,
  color = Colors.ink,
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export const ChevronLeft = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M15 6l-6 6 6 6" />
  </Stroke>
);
export const ChevronRight = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M9 6l6 6-6 6" />
  </Stroke>
);
export const ChevronDown = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M6 9l6 6 6-6" />
  </Stroke>
);
export const ChevronUp = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M6 15l6-6 6 6" />
  </Stroke>
);
export const Plus = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Stroke>
);
export const Close = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
);
export const Search = (p: IconProps) => (
  <Stroke {...p}>
    <Circle cx="11" cy="11" r="6" />
    <Path d="M20 20l-4.5-4.5" />
  </Stroke>
);
export const Check = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M5 12l5 5L20 7" />
  </Stroke>
);
export const Basket = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M4 9h16l-1.6 10.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8z" />
    <Path d="M8 9l2.5-5M16 9l-2.5-5" />
  </Stroke>
);
export const Share = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M12 15V3M7 8l5-5 5 5" />
    <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Stroke>
);
export const Clock = (p: IconProps) => (
  <Stroke {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 7v5l3 2" />
  </Stroke>
);
export const Person = (p: IconProps) => (
  <Stroke {...p}>
    <Circle cx="9" cy="8" r="3.2" />
    <Path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
  </Stroke>
);
export const Book = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <Path d="M5 17a3 3 0 0 1 3-3h11" />
  </Stroke>
);
export const Home = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M3 11l9-7 9 7" />
    <Path d="M5 10v10h14V10" />
    <Path d="M12 13v5M9.5 15.5h5" />
  </Stroke>
);
export const Mail = (p: IconProps) => (
  <Stroke {...p}>
    <Path d="M4 7h16v10H4z" />
    <Path d="M4 7l8 6 8-6" />
  </Stroke>
);
export const More = (p: IconProps) => (
  <Stroke {...p}>
    <Circle cx="5" cy="12" r="1" />
    <Circle cx="12" cy="12" r="1" />
    <Circle cx="19" cy="12" r="1" />
  </Stroke>
);
export const Calendar = (p: IconProps) => (
  <Stroke {...p}>
    <Rect x="3" y="5" width="18" height="16" rx="3" />
    <Path d="M3 10h18M8 3v4M16 3v4" />
  </Stroke>
);

/** Logo 7, "Grocery bag": tomato bag, ink handle, herb sprig, white G. */
export function Logo({ size = 104 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Grocr">
      <Path
        d="M38 38v-6a12 12 0 0 1 24 0v6"
        stroke={Colors.ink}
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
      <Path d="M22 38h56l-4 42a6 6 0 0 1-6 5H32a6 6 0 0 1-6-5z" fill={Colors.tomato} />
      <Path d="M31 27c-2-6 2-12 9-12 1 7-3 11-9 12z" fill={Colors.herb} />
      <SvgText
        x="50"
        y="74"
        textAnchor="middle"
        fontFamily="BricolageGrotesque_700Bold"
        fontWeight="700"
        fontSize="34"
        fill="#FFFFFF">
        G
      </SvgText>
    </Svg>
  );
}
