import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { X } from '@/components/icons';
import { Radius, Size, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = TextInputProps & {
  label: string;
  /** Shows a clear button at the end while there's text (DESIGN.md §7, 27b). */
  onClear?: () => void;
};

/** Field with a small label above the value; focused = 2 px ink border (DESIGN.md §6). */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, style, onFocus, onBlur, onClear, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        { backgroundColor: theme.backgroundSelected, borderColor: focused ? theme.text : 'transparent' },
      ]}>
      <View style={onClear ? styles.withClear : undefined}>
      <View style={[styles.inner, onClear ? styles.flex : null]}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.text}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, { color: theme.text }, style]}
        {...rest}
      />
      </View>
      {onClear && rest.value ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${label.toLowerCase()}`}
          style={[styles.clear, { backgroundColor: theme.backgroundElement }]}>
          <X size={20} color={theme.text} />
        </Pressable>
      ) : null}
      </View>
    </View>
  );
});

type SelectProps = {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  accessibilityHint?: string;
};

/** Same look as TextField, but opens a picker instead of the keyboard. */
export function SelectField({ label, value, placeholder, onPress, accessibilityHint }: SelectProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? 'not set'}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.field,
        { backgroundColor: theme.backgroundSelected, borderColor: 'transparent', opacity: pressed ? 0.85 : 1 },
      ]}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="label" color={value ? 'text' : 'textSecondary'} style={styles.value}>
        {value ?? placeholder}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  withClear: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inner: { gap: Spacing.half },
  flex: { flex: 1 },
  clear: { width: Size.minTouch, height: Size.minTouch, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  field: {
    minHeight: Size.field,
    borderRadius: Radius.field,
    borderWidth: 2,
    paddingHorizontal: Spacing.gutter - 2,
    paddingVertical: Spacing.two,
    justifyContent: 'center',
    gap: Spacing.half,
  },
  input: {
    ...Type.label,
    lineHeight: undefined,
    padding: 0,
    margin: 0,
    outlineWidth: 0, // web: the field's own 2 px border is the focus indicator
  },
  value: {
    paddingVertical: 1,
  },
});
