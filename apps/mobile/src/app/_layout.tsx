import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OfflineBanner } from '@/components/offline-banner';
import { Toast } from '@/components/ui/toast';
import { ProfileLoadError } from '@/components/profile-load-error';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useAppearance } from '@/lib/appearance';
import { startAuthListener, useAuth } from '@/lib/auth';
import { useApplyPendingCode, useLinkCapture } from '@/lib/links';
import { startNetworkListener } from '@/lib/network';
import { useNotificationsChannel, usePushRouting } from '@/lib/notifications';
import { flush, startOutbox } from '@/lib/outbox';
import { useMe } from '@/lib/profile';
import { persistOptions, queryClient } from '@/lib/query-client';
import { useSettings } from '@/lib/settings';
import { setSentryUser, wrapRoot } from '@/lib/sentry';

SplashScreen.preventAutoHideAsync();

// Sheets slide up over the screen (DESIGN.md §7, 04): radius 32 top corners, dimmed behind.
const SHEET = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  sheetCornerRadius: 32,
  sheetGrabberVisible: true,
} as const;
startAuthListener();
startNetworkListener();
startOutbox();

function RootNavigator() {
  const theme = useTheme();
  // DESIGN.md §4: Bricolage Grotesque 700 for headlines and big numbers, Manrope for the rest.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;
  useEffect(() => setSentryUser(userId), [userId]);
  const me = useMe();

  const signedIn = Boolean(session);
  const loading = (!fontsLoaded && !fontError) || !ready || (signedIn && me.isPending);
  const onboarded = me.data?.onboarded ?? false;
  // Invite and share links survive sign-up and onboarding (FR-AUTH-07).
  useLinkCapture();
  useApplyPendingCode(signedIn && onboarded);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Quiz work saved offline is sent as soon as we know who is signed in (FR-OFF-02).
  useEffect(() => {
    if (signedIn) void flush();
  }, [signedIn]);

  if (loading) return null;

  // Where each guarded group sends someone it no longer admits (Expo Router 58 otherwise falls back
  // to the first screen that's still open, which was the legal page): after signing in, to
  // onboarding or Today; after signing out, to sign-in.
  const home = onboarded ? '/' : '/onboarding';
  const start = signedIn ? home : '/sign-in';

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        {/* FR-PROF-01: signed-in students can't reach the tabs until onboarding is done. */}
        <Stack.Protected guard={!signedIn} redirectTo={home}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded} redirectTo={start}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded} redirectTo={start}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="course/[id]/index" />
          <Stack.Screen name="document/[id]/index" />
          <Stack.Screen name="document/[id]/topic/[topicId]" />
          <Stack.Screen name="document/[id]/page/[n]" />
          <Stack.Screen name="document/[id]/chat" />
          <Stack.Screen name="profile/edit" />
          <Stack.Screen name="account/delete" />
          <Stack.Screen name="report" options={SHEET} />
          <Stack.Screen name="quiz/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="quiz/[id]/play" options={{ gestureEnabled: false }} />
          <Stack.Screen name="quiz/[id]/results" />
          <Stack.Screen name="daily5/done" options={{ gestureEnabled: false }} />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="course/[id]/share" options={SHEET} />
          <Stack.Screen name="course/[id]/members" />
          <Stack.Screen name="shares/[memberId]" />
          <Stack.Screen name="c/[code]" />
          <Stack.Screen name="i/[code]" />
          <Stack.Screen name="invite" />
          <Stack.Screen name="settings/privacy" />
          <Stack.Screen name="settings/themes" />
          <Stack.Screen name="settings/reminders" />
          <Stack.Screen name="celebrate/[achievementId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="recap/[week]" />
          <Stack.Screen name="quiz/[id]/review" />
          <Stack.Screen name="flashcards/[id]" />
          <Stack.Screen name="upload" options={SHEET} />
          <Stack.Screen name="course/new" options={SHEET} />
          <Stack.Screen name="course/[id]/edit" options={SHEET} />
          <Stack.Screen name="course/[id]/offline" options={SHEET} />
          <Stack.Screen name="course/[id]/past-paper" options={SHEET} />
          <Stack.Screen name="document/[id]/edit" options={SHEET} />
          <Stack.Screen name="document/[id]/topic-menu" options={SHEET} />
        </Stack.Protected>
        <Stack.Screen name="auth-callback" />
        {/* Readable before signing in too (sign-in footer, FR-AUTH-03). */}
        <Stack.Screen name="legal" />
      </Stack>
      {signedIn && me.isError && !me.data ? <ProfileLoadError error={me.error} onRetry={() => me.refetch()} /> : null}
      <OfflineBanner />
      {signedIn && onboarded ? <Live /> : null}
    </>
  );
}

/** Live notifications for a signed-in, onboarded student: the Realtime channel, push taps and
 * the toast (FR-NOTIF-02/03/07). */
function Live() {
  useNotificationsChannel();
  usePushRouting();
  // The theme and study modes everyone reads (FR-HAB-07).
  const settings = useSettings().data;
  useEffect(() => {
    if (settings) {
      useAppearance.getState().set({
        accent: settings.accent,
        nightMode: settings.night_mode,
        lowData: settings.low_data_mode,
      });
    }
  }, [settings]);
  // Signed out: the next account starts from the defaults.
  useEffect(() => () => useAppearance.getState().set({ accent: 'ink', nightMode: false, lowData: false }), []);
  return <Toast />;
}

function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    // Gesture handler 3 needs a root view above every GestureDetector, e.g. the toast's swipe.
    <GestureHandlerRootView style={styles.root}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style="auto" />
          <RootNavigator />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

// NFR-09: crash reports when EXPO_PUBLIC_SENTRY_DSN is set.
export default wrapRoot(RootLayout);
