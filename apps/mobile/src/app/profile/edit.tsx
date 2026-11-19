import { router } from 'expo-router';
import { useState } from 'react';

import { Check, ChevronLeft } from '@/components/icons';
import { type Draft, draftFrom, missingFrom, PhotoStep, PracticeStep, SchoolStep, updateFrom } from '@/components/profile-steps';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { ToggleRow } from '@/components/ui/toggle-row';
import { friendlyError } from '@/lib/errors';
import { useMe, useUpdateMe } from '@/lib/profile';

// "Edit" on the Account tab (DESIGN.md §7, 13; PROFILE_V2.md §1): steps 1–3 of profile setup in one
// form, plus who sees the photo (FR-PROF-02/04/05/06/07).
export default function EditProfileScreen() {
  const me = useMe();
  const update = useUpdateMe();
  const [draft, set] = useState<Draft>(() => draftFrom(me.data));
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const missing = missingFrom(draft);
    if (missing) return setError(missing.message);
    setError(null);
    update.mutate(updateFrom(draft), { onSuccess: () => router.back(), onError: (e) => setError(friendlyError(e)) });
  };

  return (
    <Screen
      footer={
        <ActionPill label="Save changes" icon={Check} onPress={save} loading={update.isPending} disabled={searching} />
      }>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      <HighlightText highlight="profile">Edit your profile</HighlightText>
      <PhotoStep draft={draft} set={set} me={me.data} />
      <ToggleRow
        label="Show my photo to classmates"
        helper="Only in courses you share or join. Off: they see initials."
        value={draft.showPhoto}
        onChange={(showPhoto) => set((d) => ({ ...d, showPhoto }))}
      />
      <SchoolStep draft={draft} set={set} searching={searching} setSearching={setSearching} />
      <PracticeStep draft={draft} set={set} />
      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}
