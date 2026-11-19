import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';
import { formatTime } from './time-pill.shared';

export type TimePillProps = {
  /** "19:30" or "19:30:00" */
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
};

export { formatTime };

function toDate(value: string) {
  const [h, m] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** An ink pill showing a time that opens the system time picker (DESIGN.md §7, 21). */
export function TimePill({ value, onChange, accessibilityLabel }: TimePillProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const pick = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'time',
        onValueChange: (_, d) => onChange(hhmm(d)),
      });
    } else {
      setOpen(!open);
    }
  };
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={pick}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${formatTime(value)}`}
        accessibilityHint="Opens a time picker"
        style={({ pressed }) => [styles.pill, { backgroundColor: theme.text, opacity: pressed ? 0.85 : 1 }]}>
        <Text variant="label" color="onInk">
          {formatTime(value)}
        </Text>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker value={toDate(value)} mode="time" display="spinner" onValueChange={(_, d) => onChange(hhmm(d))} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-start', gap: Spacing.one },
  pill: { borderRadius: Radius.full, paddingHorizontal: Spacing.gutter, minHeight: 44, justifyContent: 'center' },
});
