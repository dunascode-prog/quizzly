import katex from 'katex';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { KATEX_CSS } from '@/components/katex-css';
import { Text } from '@/components/ui/text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The formula as HTML, rendered here so the WebView needs no script library. Untrusted
 * commands (\href, \url…) stay off and expansion is capped so a formula can't hang it. */
function render(tex: string) {
  try {
    return katex.renderToString(tex, { displayMode: true, throwOnError: false, trust: false, maxExpand: 500 });
  } catch {
    return tex.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  }
}

// Everything is local: KaTeX's stylesheet with its fonts inlined, and no network (FR-SEC-16).
function page(html: string, color: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; script-src 'unsafe-inline'">
<style>${KATEX_CSS}</style>
<style>html,body{margin:0;background:transparent;color:${color};}#m{padding:4px 0;overflow-x:auto;font-size:18px}</style>
</head><body><div id="m">${html}</div>
<script>
  var el = document.getElementById('m');
  window.ReactNativeWebView.postMessage(String(Math.ceil(el.getBoundingClientRect().height)));
</script></body></html>`;
}

/**
 * A display formula ($$…$$) rendered with KaTeX in a small WebView, only where one appears
 * (ARCHITECTURE §5.7). Works offline; shows the LaTeX source until the WebView has measured it.
 */
export function MathBlock({ tex }: { tex: string }) {
  const theme = useTheme();
  const [height, setHeight] = useState<number | null>(null);
  const html = useMemo(() => page(render(tex), theme.text), [tex, theme.text]);
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
        originWhitelist={['about:*', 'data:*']}
        // The page is self-contained: never navigate or load anything from the web.
        onShouldStartLoadWithRequest={(req) => !/^https?:/i.test(req.url)}
        source={{ html }}
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
