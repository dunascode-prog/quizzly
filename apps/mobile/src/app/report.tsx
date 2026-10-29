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
import { type ReportTarget, useReport } from '@/lib/study';

type Reason = 'wrong' | 'unclear' | 'inappropriate' | 'other';

const TARGET_NAMES = { explanation: 'explanation', question: 'question', chat_message: 'answer', avatar: 'photo' };

const REASONS: { value: Reason; label: string }[] = [
  { value: 'wrong', label: 'Wrong' },
  { value: 'unclear', label: 'Unclear' },
  { value: 'inappropriate', label: 'Inappropriate' },
];
// A photo isn't wrong or unclear: offensive, or something else (someone else, a logo).
const PHOTO_REASONS: { value: Reason; label: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'other', label: 'Something else' },
];

// Report sheet (DESIGN.md §7 "not drawn", FR-MOD-01; a coursemate's photo: FR-MOD-06).
export default function ReportSheet() {
  const { targetId, targetType = 'explanation' } = useLocalSearchParams<{
    targetId: string;
    targetType?: ReportTarget;
  }>();
  const reasons = targetType === 'avatar' ? PHOTO_REASONS : REASONS;
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
      { target_type: targetType, target_id: targetId, reason, note: note.trim() || undefined },
      { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) },
    );
  };

  return (
    <Sheet title="Report" onClose={() => router.back()}>
      <Text variant="body" color="textSecondary">
        Tell us what&apos;s wrong with this {TARGET_NAMES[targetType]}. We read every report.
      </Text>
      <View style={styles.pills} accessibilityRole="radiogroup" accessibilityLabel="Reason">
        {reasons.map((r) => (
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
