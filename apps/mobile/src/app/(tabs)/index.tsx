import { StyleSheet, View } from 'react-native';

import { ProfileHeader } from '@/components/profile-header';
import { HighlightText } from '@/components/ui/highlight-text';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMe } from '@/lib/profile';

// Screen 03 (DESIGN.md §7). Courses, the continue card and uploads arrive with FR-CRS / FR-DOC.
export default function LibraryScreen() {
  const theme = useTheme();
  const me = useMe();
  const firstName = me.data?.full_name?.split(' ')[0];

  return (
    <Screen bottomInset={BottomTabInset}>
      <ProfileHeader me={me.data} title={firstName ? `Hello, ${firstName}` : 'Hello'} />

      <HighlightText highlight="courses">Revise your courses</HighlightText>

      <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
        <Text variant="title">Add your first course</Text>
        <Text variant="body" color="textSecondary">
          Upload slides or photos of your notes and Quizzly turns them into explanations and practice
          questions. Uploading is coming in the next update.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
