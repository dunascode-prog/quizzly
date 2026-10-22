import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  value: string;
  onChangeText: (code: string) => void;
  length?: number;
};

/**
 * One hidden input drawn as separate digit boxes, so paste and SMS/email autofill
 * ("one-time-code") fill every box at once.
 */
export const CodeField = forwardRef<TextInput, Props>(function CodeField({ value, onChangeText, length = 6 }, ref) {
  const theme = useTheme();
  const focus = () => (ref && typeof ref === 'object' ? ref.current?.focus() : undefined);

  return (
    <Pressable onPress={focus} accessible={false}>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {Array.from({ length }, (_, i) => {
          const active = i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                { backgroundColor: theme.backgroundSelected, borderColor: active ? theme.text : 'transparent' },
              ]}>
              <Text variant="title">{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        accessibilityLabel={`${length}-digit code`}
        style={styles.hidden}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  box: {
    flex: 1,
    minHeight: Size.field,
    borderRadius: Radius.field - 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
});
