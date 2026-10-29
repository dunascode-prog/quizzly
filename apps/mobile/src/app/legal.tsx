import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ChevronLeft } from '@/components/icons';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// A plain-language summary of how Quizzly handles data (NFR-06, NDPA 2023), describing what the
// app does today. The full Privacy Policy and Terms still need to be written and approved; link
// them from here when they exist.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What we keep',
    body: [
      'Your name, email, school, department and level.',
      'The notes you upload and the text we read from them.',
      'Your quizzes, answers, scores and chats, and how much of each daily limit you have used.',
    ],
  },
  {
    title: 'How we use it',
    body: [
      'To build outlines, explain topics, write and mark questions, and answer your questions about your notes.',
      'To do that, short excerpts of your notes are sent to AI services (Groq, OpenRouter, Cloudflare).',
      'We never sell your data, and Quizzly does not use your files to train AI models.',
    ],
  },
  {
    title: 'Shared files',
    body: [
      'If another student uploads exactly the same file, it is processed once and both of you use the result. Neither of you can see the other’s account, quizzes or chats.',
    ],
  },
  {
    title: 'Deleting',
    body: [
      'You can delete any document at any time.',
      'Deleting your account (Account, then Delete account) removes your profile, notes, quizzes and chats. Stored files are removed straight away, or within 24 hours if storage is busy.',
    ],
  },
  {
    title: 'Using Quizzly',
    body: [
      'Quizzly is for your own study. Upload only notes you are allowed to use.',
      'AI answers can be wrong. Check them against the page they cite.',
    ],
  },
];

// "Privacy and terms" from the Account tab (DESIGN.md §7, 13).
export default function LegalScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <HighlightText highlight="privacy">Your privacy</HighlightText>
      {SECTIONS.map((s) => (
        <View key={s.title} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Text variant="heading" accessibilityRole="header">
            {s.title}
          </Text>
          {s.body.map((line) => (
            <Text key={line} variant="body" color="textSecondary">
              {line}
            </Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card - 4, padding: Spacing.gutter - 2, gap: Spacing.two },
});
