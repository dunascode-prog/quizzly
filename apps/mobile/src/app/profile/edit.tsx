import { ProfileForm } from '@/components/profile-form';

// "Edit" on the Account tab (DESIGN.md §7, 13; FR-PROF-02).
export default function EditProfileScreen() {
  return <ProfileForm mode="edit" />;
}
