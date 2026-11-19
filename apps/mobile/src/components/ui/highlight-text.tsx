import { StyleSheet, View } from 'react-native';

import { Colors, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccent } from '@/lib/appearance';

import { Text } from './text';

type Props = {
  /** The whole headline, e.g. "Where do you study?". */
  children: string;
  /** The word (or short phrase, e.g. "CSC 225") set on an ink block. Must appear in `children`. */
  highlight: string;
  variant?: 'display' | 'hero' | 'title';
};

/** Screen headline with one word on an ink block (DESIGN.md §4). Wraps word by word; a highlighted
 * phrase stays together on its block. */
export function HighlightText({ children, highlight, variant = 'display' }: Props) {
  const theme = useTheme();
  const accent = useAccent();
  const at = children.indexOf(highlight);
  const words =
    highlight && at >= 0
      ? [
          ...children.slice(0, at).split(' ').filter(Boolean),
          highlight,
          ...children.slice(at + highlight.length).split(' ').filter(Boolean),
        ]
      : children.split(' ');
  const type = Type[variant];

  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={children}>
      {words.map((word, i) =>
        word === highlight ? (
          <View key={i} style={[styles.block, { backgroundColor: accent ?? theme.text }]}>
            {/* Text on an accent is always ink (DESIGN.md §3.2). */}
            <Text variant={variant} color="onInk" style={accent ? { color: Colors.light.text } : undefined}>
              {word}
            </Text>
          </View>
        ) : (
          <Text key={i} variant={variant} style={{ marginRight: type.fontSize * 0.25 }}>
            {word}
          </Text>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  block: {
    paddingHorizontal: 10,
    borderRadius: 12,
    marginRight: 10,
  },
});
