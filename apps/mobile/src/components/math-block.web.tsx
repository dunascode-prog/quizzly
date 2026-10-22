import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The web preview has no WebView; show the LaTeX source. Phones render it with KaTeX. */
export function MathBlock({ tex }: { tex: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement }]} accessibilityLabel={`Formula: ${tex}`}>
      <Text variant="small" style={{ fontFamily: Fonts.mono }}>
        {tex}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.field, padding: Spacing.three },
});
