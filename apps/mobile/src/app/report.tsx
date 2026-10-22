import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { Pill } from '@/components/ui/pill';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { useReport } from '@/lib/study';

type Reason = 'wrong' | 'unclear' | 'inappropriate';

const REASONS: { value: Reason; label: string }[] = [
  { value: 'wrong', label: 'Wrong' },
  { value: 'unclear', label: 'Unclear' },
  { value: 'inappropriate', label: 'Inappropriate' },
];

// Report sheet (DESIGN.md §7 "not drawn", FR-MOD-01).
export default function ReportSheet() {
  const { targetId } = useLocalSearchParams<{ targetId: string }>();
  const report = useReport();
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    if (!reason) {
      setError('Choose what is wrong with it.');
      return;
    }
    setError(null);
    report.mutate(
      { target_id: targetId, reason, note: note.trim() || undefined },
      { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) },
    );
  };

  return (
    <Sheet title="Report" onClose={() => router.back()}>
      <Text variant="body" color="textSecondary">
        Tell us what&apos;s wrong with this explanation. We read every report.
      </Text>
      <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel="Reason">
        {REASONS.map((r) => (
          <Pill key={r.value} label={r.label} role="radio" selected={reason === r.value} onPress={() => setReason(r.value)} />
        ))}
      </View>
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} multiline />
      {error ? <Banner message={error} /> : null}
      <ActionPill label="Send report" icon={Check} onPress={send} loading={report.isPending} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
