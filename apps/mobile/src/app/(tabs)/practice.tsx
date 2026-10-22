import { StyleSheet, View } from 'react-native';

import { HighlightText } from '@/components/ui/highlight-text';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Quizzes, attempts and results land here in M3 (FR-QUIZ-05/07).
export default function PracticeScreen() {
  const theme = useTheme();
  return (
    <Screen bottomInset={BottomTabInset}>
      <HighlightText highlight="practice">Your practice</HighlightText>
      <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
        <Text variant="title">No quizzes yet</Text>
        <Text variant="body" color="textSecondary">
          Your quizzes and scores will show up here once you upload notes.
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
