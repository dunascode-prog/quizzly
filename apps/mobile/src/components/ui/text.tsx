import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextProps = RNTextProps & {
  variant?: keyof typeof Type;
  color?: ThemeColor;
};

/** All app text goes through here so it uses the DESIGN.md type scale and theme colours. */
export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const theme = useTheme();
  return <RNText style={[Type[variant], { color: theme[color] }, style]} {...rest} />;
}
