import { Tabs } from 'expo-router/js-tabs';

import { BookOpen, SquareCheck, User } from '@/components/icons';
import { FloatingTabBar, type TabMeta } from '@/components/ui/floating-tab-bar';
import { useTheme } from '@/hooks/use-theme';

const TABS: Record<string, TabMeta> = {
  index: { label: 'Library', icon: BookOpen },
  practice: { label: 'Practice', icon: SquareCheck },
  account: { label: 'Account', icon: User },
};

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} tabs={TABS} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="practice" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
