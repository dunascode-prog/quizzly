import { Redirect } from 'expo-router';

// Google sign-in returns here. The auth session browser normally handles the redirect itself;
// if the OS opens the app with this link instead, send the student on to the right screen.
export default function AuthCallback() {
  return <Redirect href="/" />;
}
