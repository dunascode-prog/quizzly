import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LucideIcon } from '@/components/icons';
import { MaxContentWidth, Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

export type TabMeta = { label: string; icon: LucideIcon };

/**
 * Ink pill floating over the content (DESIGN.md §6): the active tab is a field-coloured pill
 * with icon + label; the others are icon-only circles that keep an accessibility label.
 */
export function FloatingTabBar({ state, navigation, tabs }: BottomTabBarProps & { tabs: Record<string, TabMeta> }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, Spacing.three) + Spacing.two }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: theme.text }]} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const meta = tabs[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const Icon = meta.icon;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => [
                focused ? styles.active : styles.inactive,
                focused && { backgroundColor: theme.backgroundSelected },
                pressed && { opacity: 0.8 },
              ]}>
              <Icon size={24} strokeWidth={2} color={focused ? theme.text : theme.inactiveOnInk} />
              {focused ? (
                <Text variant="label" numberOfLines={1}>
                  {meta.label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.gutter,
    right: Spacing.gutter,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    minHeight: Size.tabBar,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: (Size.tabBar - Size.iconButton) / 2,
  },
  active: {
    minHeight: Size.iconButton,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  inactive: {
    width: Size.iconButton,
    height: Size.iconButton,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
