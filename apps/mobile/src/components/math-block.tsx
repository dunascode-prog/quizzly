import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist';

function page(tex: string, color: string) {
  // Passed as JSON with "<" escaped, so nothing in the formula can break out of the script.
  const js = JSON.stringify(tex).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${KATEX}/katex.min.css">
<style>html,body{margin:0;background:transparent;color:${color};}#m{padding:4px 0;overflow-x:auto;font-size:18px}</style>
</head><body><div id="m"></div>
<script src="${KATEX}/katex.min.js"></script>
<script>
  var el = document.getElementById('m');
  try { katex.render(${js}, el, { displayMode: true, throwOnError: false }); }
  catch (e) { el.textContent = ${js}; }
  window.ReactNativeWebView.postMessage(String(Math.ceil(el.getBoundingClientRect().height)));
</script></body></html>`;
}

/**
 * A display formula ($$…$$) rendered with KaTeX in a small WebView, only where one appears
 * (ARCHITECTURE §5.7). Shows the LaTeX source until it has rendered, or if offline.
 */
export function MathBlock({ tex }: { tex: string }) {
  const theme = useTheme();
  const [height, setHeight] = useState<number | null>(null);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Formula: ${tex}`}>
      {height === null ? (
        <View style={[styles.fallback, { backgroundColor: theme.backgroundElement }]}>
          <Text variant="small" style={{ fontFamily: Fonts.mono }}>
            {tex}
          </Text>
        </View>
      ) : null}
      <WebView
        originWhitelist={['*']}
        source={{ html: page(tex, theme.text) }}
        onMessage={(e) => setHeight(Number(e.nativeEvent.data) || null)}
        scrollEnabled={false}
        style={{ height: height ?? 1, opacity: height ? 1 : 0, backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { borderRadius: Radius.field, padding: Spacing.three },
});
