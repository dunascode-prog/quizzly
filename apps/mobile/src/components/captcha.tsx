import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { env } from '@/lib/env';

import { captchaEnabled, captchaHtml, type CaptchaProps } from './captcha.shared';

export { captchaEnabled } from './captcha.shared';

/** The Turnstile check in a small WebView (FR-SEC-23). The page's address must be one of the
 * widget's hostnames in Cloudflare, so it loads from the invite domain. */
export function Captcha({ onToken, resetKey, theme }: CaptchaProps) {
  if (!captchaEnabled) return null;
  return (
    <View style={styles.box} accessible accessibilityLabel="Security check">
      <WebView
        key={resetKey}
        originWhitelist={['*']}
        source={{ html: captchaHtml(theme), baseUrl: `https://${env.turnstileHost}` }}
        onMessage={(e) => {
          try {
            onToken((JSON.parse(e.nativeEvent.data) as { token: string | null }).token);
          } catch {
            onToken(null);
          }
        }}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 70, alignItems: 'stretch' },
  web: { backgroundColor: 'transparent' },
});
