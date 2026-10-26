import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Tells TanStack Query when the device goes on or offline, so queries pause and keep their saved
 * data instead of failing, and refetch on reconnect (FR-OFF-01). Call once at start-up.
 */
export function startNetworkListener() {
  if (typeof window === 'undefined') return; // web server rendering
  onlineManager.setEventListener((setOnline) => {
    const stopNetInfo = NetInfo.addEventListener((state) => {
      // isConnected is null while unknown; only a definite "no" counts as offline. Reachability
      // isn't used: on the web it lags behind reconnecting and would keep the app "offline".
      setOnline(state.isConnected !== false);
    });
    if (Platform.OS !== 'web' || typeof window === 'undefined') return stopNetInfo;
    // In Chrome NetInfo only watches navigator.connection, which may not report reconnecting;
    // the window's online/offline events always do.
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      stopNetInfo();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  });
}

export function useOnline() {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}
