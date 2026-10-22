import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChevronRight } from '@/components/icons';
import { FontFamily, Radius, Size, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

type Props = {
  title: string;
  meta?: string;
  metaColor?: ThemeColor;
  /** Short text in a 48 ink circle, e.g. a course code prefix ("CSC"). */
  badge?: string;
  /** Replaces the chevron, e.g. a "Retry" pill. */
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityHint?: string;
};

/** Surface card for a course or document (DESIGN.md §6). */
export function ListCard({ title, meta, metaColor = 'textSecondary', badge, trailing, onPress, onLongPress, accessibilityHint }: Props) {
  const theme = useTheme();
  const body = (
    <>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.text }]} importantForAccessibility="no-hide-descendants">
          <Text variant="caption" color="onInk" style={styles.badgeText} numberOfLines={1}>
            {badge}
          </Text>
        </View>
      ) : null}
      <View style={styles.text}>
        <Text variant="label" style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text variant="small" color={metaColor} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <ChevronRight size={22} color={theme.text} strokeWidth={2} /> : null)}
    </>
  );

  if (!onPress && !onLongPress) {
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]} accessible accessibilityLabel={[title, meta].filter(Boolean).join(', ')}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[title, meta].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: Size.field + 8,
    borderRadius: Radius.option + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.twoHalf,
  },
  badge: {
    width: Size.minTouch,
    height: Size.minTouch,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13 },
  text: { flex: 1, gap: Spacing.half },
  title: { fontSize: 17, fontFamily: FontFamily.semibold },
});
