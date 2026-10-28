import { useLocalSearchParams } from 'expo-router';

import { JoinCourse } from '@/components/join-course';

// Screen 20 for a share link, https://{INVITE_DOMAIN}/c/{code} (FR-SHARE-01; D5 adds the
// Android App Link so the link opens here).
export default function ShareLinkScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <JoinCourse code={code} />;
}
