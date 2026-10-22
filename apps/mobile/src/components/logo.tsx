import Svg, { Circle, Path } from 'react-native-svg';

/** "Checked Q" mark from assets/brand/logo.svg. Single colour only (DESIGN.md §8). */
export function Logo({ size = 32, color }: { size?: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="8 4 92 92"
      fill="none"
      stroke={color}
      strokeWidth={12}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityLabel="Quizzly"
      accessibilityRole="image">
      <Circle cx={44} cy={44} r={30} />
      <Path d="M60 72 L72 84 L94 60" />
    </Svg>
  );
}
