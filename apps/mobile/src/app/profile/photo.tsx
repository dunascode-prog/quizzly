import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Camera, Eye, Image, type LucideIcon, Sun, Trash, User } from '@/components/icons';
import { usePhotoPicker } from '@/components/profile-steps';
import { Banner } from '@/components/ui/banner';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Radius, Size, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { saveAvatar, useMyAvatar } from '@/lib/avatar';
import { useMe } from '@/lib/profile';

const TIPS: { icon: LucideIcon; label: string }[] = [
  { icon: Sun, label: 'Good light' },
  { icon: User, label: 'Just you' },
  { icon: Eye, label: 'Face the camera' },
];

function Row({
  icon: Icon,
  title,
  sub,
  color = 'text',
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
  color?: ThemeColor;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={sub}
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.icon, { backgroundColor: color === 'danger' ? theme.dangerSoft : theme.backgroundElement }]}>
        <Icon size={22} color={theme[color]} strokeWidth={2} />
      </View>
      <View style={styles.flex}>
        <Text variant="label" color={color}>
          {title}
        </Text>
        {sub ? (
          <Text variant="small" color="textSecondary">
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// 02b Profile photo sheet (PROFILE_V2.md, FR-PROF-04): camera, gallery, remove. Opened from step 1
// of onboarding, edit profile and the camera badge on Account.
export default function PhotoSheet() {
  const theme = useTheme();
  const me = useMe();
  const hasPhoto = Boolean(useMyAvatar(me.data));
  const { pick, error } = usePhotoPicker();

  return (
    <Sheet title="Profile photo" highlight="photo" onClose={() => router.back()}>
      <Row icon={Camera} title="Take a photo" sub="Uses the front camera" onPress={() => void pick('camera', true)} />
      <Row icon={Image} title="Choose from gallery" sub="JPG, PNG or HEIC" onPress={() => void pick('gallery', true)} />
      {hasPhoto ? (
        <Row
          icon={Trash}
          title="Remove photo"
          color="danger"
          onPress={() => {
            void saveAvatar(null);
            router.back();
          }}
        />
      ) : null}
      {error ? <Banner message={error} /> : null}
      <View style={styles.tips}>
        {TIPS.map(({ icon: Icon, label }) => (
          <View key={label} style={[styles.tip, { backgroundColor: theme.backgroundSelected }]}>
            <Icon size={16} color={theme.text} strokeWidth={2} />
            <Text variant="small" color="text">
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="small" color="textSecondary">
        We crop it to a circle and shrink it to a small file. Photos of other people, logos or anything offensive can be
        removed.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: Size.field,
    borderRadius: Radius.option,
  },
  icon: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: Spacing.half },
  tips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
  },
});
