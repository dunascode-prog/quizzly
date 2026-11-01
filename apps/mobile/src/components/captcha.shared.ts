import { env } from '@/lib/env';

/*
 * Cloudflare Turnstile on email sign-in (FR-SEC-23). Supabase checks the token when "Enable CAPTCHA
 * protection" is on (Authentication → Bot and Abuse Protection, provider Turnstile, with the secret
 * key there). The widget needs the public site key; without it the check is skipped (local dev).
 */

export const captchaEnabled = Boolean(env.turnstileSiteKey);

export type CaptchaProps = {
  /** A fresh one-time token, or null when it expired or failed. */
  onToken: (token: string | null) => void;
  /** Change it to get a new token after one was used (each works once). */
  resetKey: number;
  theme: 'light' | 'dark';
};

/** The page that runs the widget: on phones inside a WebView, on the web inside the app's page. */
export function captchaHtml(theme: 'light' | 'dark') {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ready&render=explicit" async defer></script>
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center}</style></head>
<body><div id="w"></div><script>
function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
function ready(){turnstile.render('#w',{sitekey:${JSON.stringify(env.turnstileSiteKey)},theme:'${theme}',
callback:function(t){send({token:t})},'expired-callback':function(){send({token:null})},
'error-callback':function(){send({token:null})}})}
</script></body></html>`;
}
