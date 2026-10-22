import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { ProfileLoadError } from '@/components/profile-load-error';
import { FontFamily } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { startAuthListener, useAuth } from '@/lib/auth';
import { useMe } from '@/lib/profile';
import { queryClient } from '@/lib/query-client';

SplashScreen.preventAutoHideAsync();

// Sheets slide up over the screen (DESIGN.md §7, 04): radius 32 top corners, dimmed behind.
const SHEET = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  sheetCornerRadius: 32,
  sheetGrabberVisible: true,
} as const;
startAuthListener();

function RootNavigator() {
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    [FontFamily.display]: require('@/assets/fonts/InterDisplay-SemiBold.ttf'),
  });
  const { session, ready } = useAuth();
  const me = useMe();

  const signedIn = Boolean(session);
  const loading = (!fontsLoaded && !fontError) || !ready || (signedIn && me.isPending);
  const onboarded = me.data?.onboarded ?? false;

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

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
          <Stack.Screen name="report" options={SHEET} />
          <Stack.Screen name="upload" options={SHEET} />
          <Stack.Screen name="course/new" options={SHEET} />
          <Stack.Screen name="course/[id]/edit" options={SHEET} />
          <Stack.Screen name="document/[id]/edit" options={SHEET} />
        </Stack.Protected>
        <Stack.Screen name="auth-callback" />
      </Stack>
      {signedIn && me.isError && !me.data ? <ProfileLoadError error={me.error} onRetry={() => me.refetch()} /> : null}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <RootNavigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
