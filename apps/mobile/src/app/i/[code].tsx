import { Redirect } from 'expo-router';

// An invite link, https://{INVITE_DOMAIN}/i/{code}, opened in the app (FR-INV-02). The root layout
// already keeps the code and credits the inviter once the student is set up (FR-AUTH-07), so
// this only lands on Today.
export default function InviteLinkScreen() {
  return <Redirect href="/" />;
}
