import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { deviceStore } from '@/lib/device-store';
import { getDaily5, homeKey } from '@/lib/home';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  target: { route?: string; params?: Record<string, string | number> };
  read_at: string | null;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
};

export type InboxFilter = 'all' | 'shared' | 'study';
type Page = { notifications: Notification[]; unread: number };

const inboxKey = (filter: InboxFilter) => ['notifications', filter] as const;

/** FR-NOTIF-04: newest first, 30 at a time. */
export function useInbox(filter: InboxFilter) {
  return useInfiniteQuery({
    queryKey: inboxKey(filter),
    queryFn: ({ pageParam }) =>
      apiFetch<Page>(`/v1/notifications?filter=${filter}${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.notifications.length >= 30 ? last.notifications[last.notifications.length - 1].created_at : null),
    enabled: Boolean(useAuth((s) => s.session)),
  });
}

function refreshInbox() {
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: homeKey }); // the bell's unread count
}

export function markRead(ids: string[]) {
  return apiFetch<void>('/v1/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) }).then(refreshInbox);
}

export function useMarkAllRead() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/v1/notifications/read-all', { method: 'POST' }),
    onSuccess: refreshInbox,
  });
}

export function useAcceptShare() {
  return useMutation({
    mutationFn: (memberId: string) =>
      apiFetch<{ member_id: string; course_id: string }>(`/v1/shares/${memberId}/accept`, { method: 'POST' }),
    onSuccess: () => {
      refreshInbox();
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

/** Block a person (FR-SHARE-09): no more shares from them, and they leave your coursemates. */
export function blockUser(userId: string) {
  return apiFetch<void>('/v1/blocks', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
}

/** Which Reminders toggle (FR-HAB-08) turns a type off; share types can't be (only blocked). */
export const TOGGLE_FOR: Record<string, 'ready' | 'recap' | 'exam' | 'due' | 'mates'> = {
  document_ready: 'ready',
  document_failed: 'ready',
  quiz_ready: 'ready',
  recap_ready: 'recap',
  reminder_exam: 'exam',
  reminder_due: 'due',
  share_member_joined: 'mates',
  invite_joined: 'mates',
};

export function turnOffType(type: string) {
  const toggle = TOGGLE_FOR[type];
  if (!toggle) return Promise.resolve();
  return apiFetch('/v1/me/notification-settings', { method: 'PATCH', body: JSON.stringify({ types: { [toggle]: false } }) });
}

/** Opens a notification's target in the app. Routes added by later screens fall back to Today. */
export function openTarget(n: Pick<Notification, 'id' | 'target' | 'read_at'>) {
  if (!n.read_at) void markRead([n.id]).catch(() => {});
  const { route, params = {} } = n.target ?? {};
  const p = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  switch (route) {
    case '/document/[id]':
      return router.push({ pathname: '/document/[id]', params: { id: p.id } });
    case '/course/[id]':
      return router.push({ pathname: '/course/[id]', params: { id: p.id } });
    case '/shares/[memberId]':
      return router.push({ pathname: '/shares/[memberId]', params: { memberId: p.memberId } });
    case '/course/[id]/members':
      return router.push({ pathname: '/course/[id]/members', params: { id: p.id } });
    case '/quiz/[id]/play':
      return router.push({ pathname: '/quiz/[id]/play', params: { id: p.id, mode: 'practice' } });
    case '/daily5':
      return getDaily5()
        .then((d) => router.push({ pathname: '/quiz/[id]/play', params: { id: d.quiz_id, mode: 'practice' } }))
        .catch(() => router.navigate('/'));
    default:
      return router.navigate('/');
  }
}

// --- the live toast (FR-NOTIF-02) ---------------------------------------------------------------

type ToastState = { current: Notification | null; show: (n: Notification) => void; hide: () => void };
export const useToast = create<ToastState>((set) => ({
  current: null,
  show: (n) => set({ current: n }),
  hide: () => set({ current: null }),
}));

/** Only events worth interrupting for get a toast; everything still lands in the inbox. */
const TOAST_TYPES = new Set(['course_shared', 'shared_course_updated', 'share_member_joined', 'document_ready', 'document_failed', 'quiz_ready', 'invite_joined']);

let newest: string | null = null; // created_at of the newest row seen, for catch-up

async function catchUp() {
  if (!newest) {
    const first = await apiFetch<Page>('/v1/notifications?filter=all').catch(() => null);
    newest = first?.notifications[0]?.created_at ?? new Date().toISOString();
    return;
  }
  const missed = await apiFetch<Page>(`/v1/notifications?filter=all&after=${encodeURIComponent(newest)}`).catch(() => null);
  if (!missed?.notifications.length) return;
  newest = missed.notifications[0].created_at;
  refreshInbox();
  const live = missed.notifications.find((n) => !n.read_at && TOAST_TYPES.has(n.type));
  if (live) useToast.getState().show(live);
}

/** FR-NOTIF-02/07, NFR-13: one Realtime channel for the signed-in student, open only while the
 * app is in the foreground, plus a catch-up fetch on start, on return to the foreground and on
 * reconnect, because Realtime can miss events while disconnected. */
export function useNotificationsChannel() {
  const userId = useAuth((s) => s.session?.user.id);
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const open = () => {
      if (channel) return;
      void catchUp();
      channel = supabase
        .channel(`notifications:${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
          const n = payload.new as Notification;
          newest = n.created_at;
          refreshInbox();
          if (TOAST_TYPES.has(n.type)) useToast.getState().show({ ...n, actor_name: null });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void catchUp();
        });
    };
    const close = () => {
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    };
    if (AppState.currentState === 'active' || Platform.OS === 'web') open();
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? open() : close()));
    return () => {
      sub.remove();
      close();
      newest = null;
    };
  }, [userId]);
}

// --- push (FR-NOTIF-03) -------------------------------------------------------------------------

const TOKEN_KEY = 'push.token';

/** Registers this phone's Expo push token once signed in. Needs a development build with an EAS
 * project ID; in Expo Go, on web, or without permission it quietly does nothing. */
export async function registerForPush() {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Quizzly', importance: Notifications.AndroidImportance.DEFAULT });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiFetch('/v1/push-tokens', { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) });
    await deviceStore.setItem(TOKEN_KEY, token);
  } catch {
    // Push is a nice-to-have; the inbox and Realtime still work.
  }
}

/** On sign-out, so this phone stops getting the student's pushes. */
export async function unregisterPush() {
  try {
    const token = await deviceStore.getItem(TOKEN_KEY);
    if (!token) return;
    await apiFetch(`/v1/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' });
    await deviceStore.removeItem(TOKEN_KEY);
  } catch {
    // Signed out already, or offline: the server drops dead tokens from Expo's receipts.
  }
}

/** Tapping a push opens its target; a push that arrives while the app is open isn't shown as a
 * banner (the toast does that job). */
export function usePushRouting() {
  const signedIn = Boolean(useAuth((s) => s.session));
  useEffect(() => {
    if (!signedIn || Platform.OS === 'web') return;
    let remove: (() => void) | undefined;
    void import('expo-notifications')
      .then((Notifications) => {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: false,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as { notification_id?: string; target?: Notification['target'] };
          if (data?.notification_id) openTarget({ id: data.notification_id, target: data.target ?? {}, read_at: null });
        });
        remove = () => sub.remove();
      })
      .catch(() => {});
    void registerForPush();
    return () => remove?.();
  }, [signedIn]);
}
