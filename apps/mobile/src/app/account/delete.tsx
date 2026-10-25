import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft, Trash } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HeroCard } from '@/components/ui/hero-card';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { useDeleteAccount } from '@/lib/profile';

const GONE = [
  'Your profile and sign-in',
  'Your courses and the notes you uploaded',
  'Your quizzes, answers and scores',
  'Your chats and feedback',
];

// Confirmation before deleting the account (DESIGN.md §7, 13; FR-AUTH-05). On success the app
// signs out, and the root layout returns to sign-in.
export default function DeleteAccountScreen() {
  const remove = useDeleteAccount();
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    remove.mutate(undefined, { onError: (e) => setError(friendlyError(e)) });
  };

  return (
    <Screen footer={<ActionPill label="Delete my account" icon={Trash} onPress={confirm} loading={remove.isPending} />}>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back, keep my account" onPress={() => router.back()} />
      <HighlightText highlight="account?">Delete your account?</HighlightText>
      <HeroCard>
        <Text variant="label" color="onInk">
          This deletes, for good:
        </Text>
        <View style={styles.list}>
          {GONE.map((line) => (
            <Text key={line} variant="body" color="mutedOnInk">
              • {line}
            </Text>
          ))}
        </View>
      </HeroCard>
      <Text variant="body" color="danger">
        This can&apos;t be undone.
      </Text>
      <Text variant="small" color="textSecondary">
        Your data is deleted straight away. Any stored file that can&apos;t be removed at once is cleared
        within 24 hours.
      </Text>
      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.one },
});
