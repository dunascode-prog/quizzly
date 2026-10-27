import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Plus } from '@/components/icons';
import { ProfileHeader } from '@/components/profile-header';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { HighlightText } from '@/components/ui/highlight-text';
import { IconButton } from '@/components/ui/icon-button';
import { ListCard } from '@/components/ui/list-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/errors';
import { courseBadge, plural } from '@/lib/format';
import { useCourses, useDocuments, useUsage } from '@/lib/library';
import { useMe } from '@/lib/profile';

// Screen 03 (DESIGN.md §7), the Library tab: courses, plus an Unfiled entry when needed (FR-CRS-01/02, FR-LIM-01).
export default function LibraryScreen() {
  const theme = useTheme();
  const me = useMe();
  const courses = useCourses();
  const unfiled = useDocuments('unfiled');
  const usage = useUsage();
  const firstName = me.data?.full_name?.split(' ')[0];
  const remaining = usage.data?.uploads.remaining;
  const empty = courses.isSuccess && courses.data.length === 0 && (unfiled.data?.length ?? 0) === 0;

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ProfileHeader me={me.data} title={firstName ? `Hello, ${firstName}` : 'Hello'} />
        </View>
        <IconButton icon={Plus} tone="ink" accessibilityLabel="Add notes" onPress={() => router.push('/upload')} />
      </View>
      {remaining !== undefined ? (
        <Text variant="small" color="textSecondary">
          {plural(remaining, 'upload')} left today
        </Text>
      ) : null}

      <HighlightText highlight="courses">Revise your courses</HighlightText>

      {courses.isError ? <Banner message={friendlyError(courses.error)} /> : null}

      {courses.isPending ? (
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.skeleton, { backgroundColor: theme.backgroundElement }]} />
          ))}
        </View>
      ) : empty ? (
        <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
          <Text variant="title">Add your first course</Text>
          <Text variant="body" color="textSecondary">
            Upload slides or notes as a PDF or PowerPoint and Quizzly turns them into a study outline.
          </Text>
          <ActionPill label="Add notes" icon={Plus} onPress={() => router.push('/upload')} />
        </View>
      ) : (
        <View style={styles.list}>
          {courses.data?.map((c) => (
            <ListCard
              key={c.id}
              badge={courseBadge(c.code)}
              title={c.title || c.code}
              meta={`${c.code} · ${plural(c.document_count, 'document')}`}
              onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })}
            />
          ))}
          {unfiled.data && unfiled.data.length > 0 ? (
            <ListCard
              title="Unfiled"
              meta={`Not in a course · ${plural(unfiled.data.length, 'document')}`}
              onPress={() => router.push({ pathname: '/course/[id]', params: { id: 'unfiled' } })}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.twoHalf },
  headerText: { flex: 1 },
  list: { gap: Spacing.twoHalf },
  skeleton: { height: 76, borderRadius: Radius.option + 2 },
  empty: { borderRadius: Radius.card, padding: Spacing.four, gap: Spacing.three },
});
