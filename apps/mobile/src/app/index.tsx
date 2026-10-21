import { useQuery } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { env } from '@/lib/env';

function ApiStatus() {
  const health = useQuery({
    queryKey: ['healthz'],
    queryFn: () => apiFetch<{ status: string }>('/healthz'),
  });

  const label = health.isPending
    ? 'Checking…'
    : health.isSuccess
      ? 'Connected'
      : 'Not reachable';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">API</ThemedText>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="code">{env.apiUrl}</ThemedText>
    </ThemedView>
  );
}

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.center}>
            Quizzly
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Upload your lecture notes. Get clear explanations and exam-style questions.
          </ThemedText>
        </ThemedView>
        <ApiStatus />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.four,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
