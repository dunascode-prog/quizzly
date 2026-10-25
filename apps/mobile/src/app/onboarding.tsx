import { ProfileForm } from '@/components/profile-form';

// Screen 02 (DESIGN.md §7): name, school, department, level and consent (FR-PROF-01, FR-AUTH-03).
export default function OnboardingScreen() {
  return <ProfileForm mode="onboarding" />;
}
