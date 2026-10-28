import { useLocalSearchParams } from 'expo-router';

import { JoinCourse } from '@/components/join-course';

// Screen 20 for a course sent in Quizzly (from the notification or the inbox).
export default function SharedWithYouScreen() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  return <JoinCourse memberId={memberId} />;
}
