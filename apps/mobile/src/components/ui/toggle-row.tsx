import type { ReactNode } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  label: string;
  helper?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Extra control under the label, e.g. the reminder time pill. */
  children?: ReactNode;
};

/** A labelled switch (DESIGN.md §6; screens 18, 21): field row, radius 22, ink track when on,
 * white knob. Accents aren't used for toggles (§3.2). */
export function ToggleRow({ label, helper, value, onChange, children }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundSelected }]}>
      <View style={styles.text}>
        <Text variant="label">{label}</Text>
        {helper ? (
          <Text variant="small" color="textSecondary">
            {helper}
          </Text>
        ) : null}
        {children}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityHint={helper}
        trackColor={{ false: theme.line, true: theme.text }}
        thumbColor={theme.backgroundSelected}
        ios_backgroundColor={theme.line}
        // react-native-web colours the "on" knob itself unless told.
        {...(Platform.OS === 'web' ? { activeThumbColor: theme.backgroundSelected } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.option, minHeight: 64 },
  text: { flex: 1, gap: 4 },
});
