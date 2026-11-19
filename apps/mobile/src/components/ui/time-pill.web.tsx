import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { TimePillProps } from './time-pill';

export { formatTime } from './time-pill.shared';

/** Web: the browser's time input, styled as the ink pill. */
export function TimePill({ value, onChange, accessibilityLabel }: TimePillProps) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.text }]}>
      {createElement('input', {
        type: 'time',
        value: value.slice(0, 5),
        'aria-label': accessibilityLabel,
        onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
        style: {
          ...StyleSheet.flatten(Type.label),
          lineHeight: `${Type.label.lineHeight}px`,
          color: theme.onInk,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          colorScheme: 'dark light',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: 44, justifyContent: 'center' },
});
