import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Size, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toIsoDay } from '@/lib/format';

import type { DateFieldProps } from './date-field';
import { Text } from './text';
import { TextButton } from './text-button';

/** Web: the browser's own date input, in the TextField look. */
export function DateField({ label, value, onChange, minimumDate }: DateFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.field, { backgroundColor: theme.backgroundSelected }]}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        {createElement('input', {
          type: 'date',
          value: value ?? '',
          min: minimumDate ? toIsoDay(minimumDate) : undefined,
          'aria-label': label,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
          style: {
            ...StyleSheet.flatten(Type.label),
            lineHeight: `${Type.label.lineHeight}px`, // unitless would be a multiplier in the DOM
            color: value ? theme.text : theme.textSecondary,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            colorScheme: 'light dark',
          },
        })}
      </View>
      {value ? <TextButton label="Remove date" color="textSecondary" onPress={() => onChange(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  field: {
    minHeight: Size.field,
    borderRadius: Radius.field,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
    gap: Spacing.half,
  },
});
