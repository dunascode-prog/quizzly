import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { formatDay, fromIsoDay, toIsoDay } from '@/lib/format';

import { SelectField } from './text-field';
import { TextButton } from './text-button';

export type DateFieldProps = {
  label: string;
  /** "YYYY-MM-DD" or null */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  minimumDate?: Date;
};

/**
 * Optional date in the TextField look (DESIGN.md §6). Android opens the system dialog; iOS shows
 * the calendar under the field. "Remove date" clears it.
 */
export function DateField({ label, value, onChange, placeholder, minimumDate }: DateFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = value ? fromIsoDay(value) : (minimumDate ?? new Date());

  const pick = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toIsoDay(date));
        },
      });
    } else {
      setOpen(!open);
    }
  };

  return (
    <View style={styles.wrap}>
      <SelectField
        label={label}
        value={value ? formatDay(value) : undefined}
        placeholder={placeholder}
        onPress={pick}
        accessibilityHint="Opens a calendar"
      />
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={current}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          accentColor={theme.text}
          onChange={(_, date) => date && onChange(toIsoDay(date))}
        />
      ) : null}
      {value ? (
        <TextButton
          label="Remove date"
          color="textSecondary"
          onPress={() => {
            setOpen(false);
            onChange(null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
});
