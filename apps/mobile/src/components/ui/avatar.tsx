import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Camera } from '@/components/icons';
import { Radius, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppearance } from '@/lib/appearance';

import { Text } from './text';

type Props = {
  /** The student's name, for the initials shown while loading, on error and without a photo. */
  name: string | null | undefined;
  /** A signed URL or a device file; null shows the initials. */
  uri?: string | null;
  size?: 28 | 40 | 48 | 52 | 72 | 76 | 156;
  /** Ink camera badge, bottom right (02a, Account). */
  badge?: boolean;
  /** Dashed ring for the empty photo on step 1 (02a). */
  dashed?: boolean;
  /** A ring around the photo, e.g. `onInk` on the ink "All set" card (02h). */
  ring?: ThemeColor;
  /** Initials colours: `ink` for ink circles in lists, `field` (default) for light ones. */
  tone?: 'field' | 'ink' | 'raised';
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Another student's photo: in low-data mode it isn't downloaded and initials show (FR-HAB-07). */
  remote?: boolean;
};

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const TEXT_SIZE: Record<NonNullable<Props['size']>, number> = { 28: 11, 40: 14, 48: 16, 52: 16, 72: 24, 76: 26, 156: 52 };

/** A student's photo, or their initials (DESIGN.md §6 `Avatar`, FR-PROF-04/05). Cached on disk by
 * URL path, so a newly signed URL for the same photo doesn't download it again. */
export function Avatar({ name, uri, size = 52, badge, dashed, ring, tone = 'field', onPress, accessibilityLabel, remote }: Props) {
  const theme = useTheme();
  const lowData = useAppearance((s) => s.lowData);
  // The URL that failed to load; a new one (another photo, a fresh signature) is tried again.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = Boolean(uri) && failed !== uri && !(remote && lowData);
  const ringWidth = ring ? 3 : dashed && !showPhoto ? 2 : 0;
  const bg = tone === 'ink' ? theme.text : tone === 'raised' ? theme.inkRaised : theme.backgroundSelected;
  const fg = tone === 'field' ? (dashed ? theme.textSecondary : theme.text) : theme.onInk;
  const badgeSize = Math.round(size * 0.29);

  const body = (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            backgroundColor: bg,
            borderWidth: ringWidth,
            borderColor: ring ? theme[ring] : theme.textSecondary,
            borderStyle: dashed && !showPhoto ? 'dashed' : 'solid',
          },
        ]}>
        <Text
          style={{ fontSize: TEXT_SIZE[size], lineHeight: TEXT_SIZE[size] * 1.2, color: fg }}
          variant={size >= 72 ? 'title' : 'label'}
          allowFontScaling={false}>
          {initials(name)}
        </Text>
        {showPhoto ? (
          <Image
            source={{ uri: uri!, cacheKey: cacheKey(uri!) }}
            cachePolicy="disk"
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            onError={() => setFailed(uri ?? null)}
            accessible={false}
          />
        ) : null}
      </View>
      {badge ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize + 8,
              height: badgeSize + 8,
              backgroundColor: theme.text,
              borderColor: theme.background,
            },
          ]}>
          <Camera size={badgeSize * 0.5} color={theme.onInk} strokeWidth={2} />
        </View>
      ) : null}
    </View>
  );

  const label = accessibilityLabel ?? (showPhoto ? 'Profile photo' : 'Add profile photo');
  if (!onPress) {
    return (
      <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} accessibilityRole="image">
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={size < 48 ? (48 - size) / 2 : undefined}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Signed URLs change every time; the storage path inside them doesn't. */
function cacheKey(uri: string) {
  const path = uri.split('?')[0];
  return path.slice(path.lastIndexOf('/', path.lastIndexOf('/') - 1) + 1);
}

const styles = StyleSheet.create({
  circle: { borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderRadius: Radius.full,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
