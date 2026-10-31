import { type ComponentRef, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { env } from '@/lib/env';

import { captchaEnabled, type CaptchaProps } from './captcha.shared';

export { captchaEnabled } from './captcha.shared';

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/** The Turnstile check on the web build (FR-SEC-23), rendered straight into the page. */
export function Captcha({ onToken, resetKey, theme }: CaptchaProps) {
  const box = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (!captchaEnabled) return;
    let id: string | null = null;
    let ts: Turnstile | null = null;
    let gone = false;
    loadTurnstile()
      .then((t) => {
        ts = t;
        const el = box.current as unknown as HTMLElement | null;
        if (gone || !el) return;
        id = t.render(el, {
          sitekey: env.turnstileSiteKey,
          theme,
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      gone = true;
      if (ts && id) ts.remove(id);
    };
  }, [resetKey, theme, onToken]);
  if (!captchaEnabled) return null;
  return <View ref={box} style={{ minHeight: 65, alignItems: 'center' }} accessibilityLabel="Security check" />;
}
