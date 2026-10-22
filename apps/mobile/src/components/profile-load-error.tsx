import { StyleSheet, View } from 'react-native';

import { RotateCw } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { signOut } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';

/** Shown over the app when a signed-in student's profile can't be loaded. Never a blank screen. */
export function ProfileLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Screen
        footer={
          <>
            <ActionPill label="Try again" icon={RotateCw} onPress={onRetry} />
            <TextButton label="Sign out" onPress={signOut} color="textSecondary" />
          </>
        }>
        <View style={styles.body}>
          <Text variant="display" accessibilityRole="header">
            We can&apos;t reach Quizzly
          </Text>
          <Banner message={friendlyError(error)} />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 16 },
});
