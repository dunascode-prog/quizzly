import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { OfflineBanner } from '@/components/offline-banner';
import { ProfileLoadError } from '@/components/profile-load-error';
import { useTheme } from '@/hooks/use-theme';
import { startAuthListener, useAuth } from '@/lib/auth';
import { startNetworkListener } from '@/lib/network';
import { flush, startOutbox } from '@/lib/outbox';
import { useMe } from '@/lib/profile';
import { persistOptions, queryClient } from '@/lib/query-client';

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
  const me = useMe();

  const signedIn = Boolean(session);
  const loading = (!fontsLoaded && !fontError) || !ready || (signedIn && me.isPending);
  const onboarded = me.data?.onboarded ?? false;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Quiz work saved offline is sent as soon as we know who is signed in (FR-OFF-02).
  useEffect(() => {
    if (signedIn) void flush();
  }, [signedIn]);

  if (loading) return null;

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        {/* FR-PROF-01: signed-in students can't reach the tabs until onboarding is done. */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
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
          <Stack.Screen name="quiz/[id]/review" />
          <Stack.Screen name="upload" options={SHEET} />
          <Stack.Screen name="course/new" options={SHEET} />
          <Stack.Screen name="course/[id]/edit" options={SHEET} />
          <Stack.Screen name="document/[id]/edit" options={SHEET} />
        </Stack.Protected>
        <Stack.Screen name="auth-callback" />
        {/* Readable before signing in too (sign-in footer, FR-AUTH-03). */}
        <Stack.Screen name="legal" />
      </Stack>
      {signedIn && me.isError && !me.data ? <ProfileLoadError error={me.error} onRetry={() => me.refetch()} /> : null}
      <OfflineBanner />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <RootNavigator />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
