import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { ApiError, apiFetch } from '@/lib/api';
import { deviceStore } from '@/lib/device-store';

/** The invite/share domain the website serves /i/ and /c/ links on (app.config.js). */
export const inviteDomain: string = (Constants.expoConfig?.extra?.inviteDomain as string | undefined) ?? 'quizzly.app';

export const inviteLink = (code: string) => `https://${inviteDomain}/i/${code}`;

type Pending = { kind: 'invite' | 'share'; code: string; channel: 'link' | 'play_referrer' };

const PENDING_KEY = 'pending.code';
const REFERRER_READ_KEY = 'referrer.read';

// The pending code lives in secure storage on phones (FR-AUTH-07); localStorage on web.
const store = {
  get: () => (Platform.OS === 'web' ? deviceStore.getItem(PENDING_KEY) : SecureStore.getItemAsync(PENDING_KEY)),
  set: (v: string) => (Platform.OS === 'web' ? deviceStore.setItem(PENDING_KEY, v) : SecureStore.setItemAsync(PENDING_KEY, v)),
  clear: () => (Platform.OS === 'web' ? deviceStore.removeItem(PENDING_KEY) : SecureStore.deleteItemAsync(PENDING_KEY)),
};

/** "/i/TOLU7" → an invite; "/c/7KQ2M9XD" → a share link. */
export function parseLink(url: string | null): Pending | null {
  const m = url?.match(/\/(i|c)\/([A-Za-z0-9]{3,20})(?:[/?#]|$)/);
  return m ? { kind: m[1] === 'i' ? 'invite' : 'share', code: m[2].toUpperCase(), channel: 'link' } : null;
}

async function savePending(p: Pending) {
  await store.set(JSON.stringify(p));
}

/** FR-INV-03: on the first launch after installing from the Play Store, the referrer carries
 * `invite=CODE` (or `share=CODE`) from the link page. Read once. */
async function readInstallReferrerOnce() {
  if (Platform.OS !== 'android') return;
  try {
    if (await deviceStore.getItem(REFERRER_READ_KEY)) return;
    await deviceStore.setItem(REFERRER_READ_KEY, '1');
    const params = new URLSearchParams(decodeURIComponent(await Application.getInstallReferrerAsync()));
    const invite = params.get('invite');
    const share = params.get('share');
    if (invite) await savePending({ kind: 'invite', code: invite.toUpperCase(), channel: 'play_referrer' });
    else if (share) await savePending({ kind: 'share', code: share.toUpperCase(), channel: 'play_referrer' });
  } catch {
    // Not installed from the Play Store (or a development build): nothing to read.
  }
}

/** One credit per device (FR-INV-03): a hash of the install ID, never the ID itself. */
async function deviceHash(): Promise<string | undefined> {
  if (Platform.OS !== 'android') return undefined;
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `quizzly:${Application.getAndroidId()}`);
  } catch {
    return undefined;
  }
}

/** Keeps any invite or share link the app is opened with, signed in or not, so it survives
 * sign-up and onboarding (FR-AUTH-07). Also reads the Play install referrer once. */
export function useLinkCapture() {
  const url = Linking.useURL();
  useEffect(() => {
    const p = parseLink(url);
    if (p) void savePending(p);
  }, [url]);
  useEffect(() => {
    void readInstallReferrerOnce();
  }, []);
}

/** Once the student is signed in and onboarded: credit whoever invited them and, for a share
 * link, open the join screen (screen 20). */
export function useApplyPendingCode(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let live = true;
    void (async () => {
      const raw = await store.get().catch(() => null);
      if (!raw || !live) return;
      let p: Pending;
      try {
        p = JSON.parse(raw) as Pending;
      } catch {
        await store.clear();
        return;
      }
      try {
        await apiFetch('/v1/referrals', {
          method: 'POST',
          body: JSON.stringify({
            code: p.code,
            channel: p.kind === 'share' && p.channel === 'link' ? 'share_link' : p.channel,
            device_hash: await deviceHash(),
          }),
        });
      } catch (e) {
        // Offline or a server hiccup: keep the code and try on the next launch.
        if (!(e instanceof ApiError) || e.status >= 500) return;
      }
      await store.clear();
      if (live && p.kind === 'share') router.push({ pathname: '/c/[code]', params: { code: p.code } });
    })();
    return () => {
      live = false;
    };
  }, [ready]);
}
