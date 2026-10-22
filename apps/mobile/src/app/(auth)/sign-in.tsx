import { useEffect, useRef, useState } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';

import { ArrowDownRight, ArrowRight, Check } from '@/components/icons';
import { Logo } from '@/components/logo';
import { StudyIllustration } from '@/components/study-illustration';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { CodeField } from '@/components/ui/code-field';
import { HeroCard } from '@/components/ui/hero-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendEmailCode, SignInCancelled, signInWithGoogle, verifyEmailCode } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';

const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Screen 01 (DESIGN.md §7): email → 6-digit code, or Google (FR-AUTH-01).
export default function SignInScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'email' | 'code' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      if (!(e instanceof SignInCancelled)) setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const sendCode = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    run('email', async () => {
      await sendEmailCode(address);
      setEmail(address);
      setCode('');
      setStep('code');
      setResendIn(RESEND_AFTER_S);
    });
  };

  // On success the auth listener updates the session and the root layout moves on.
  const verify = (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return;
    run('code', () => verifyEmailCode(email, value));
  };

  const onCodeChange = (value: string) => {
    setCode(value);
    if (value.length === CODE_LENGTH) verify(value);
  };

  const footer =
    step === 'email' ? (
      <>
        <ActionPill label="Continue" icon={ArrowRight} onPress={sendCode} loading={busy === 'email'} disabled={busy !== null && busy !== 'email'} />
        <TextButton
          label="Continue with Google"
          onPress={() => run('google', signInWithGoogle)}
          disabled={busy !== null}
        />
        <Text variant="caption" color="textSecondary" style={styles.legal}>
          By continuing you agree to the Terms and Privacy Policy.
        </Text>
      </>
    ) : (
      <>
        <ActionPill
          label="Verify"
          icon={Check}
          onPress={() => verify()}
          loading={busy === 'code'}
          disabled={code.length !== CODE_LENGTH}
        />
        <TextButton
          label="Use a different email"
          onPress={() => {
            setStep('email');
            setError(null);
          }}
          disabled={busy !== null}
        />
      </>
    );

  return (
    <Screen footer={footer}>
      <View style={[styles.logo, { backgroundColor: theme.text }]}>
        <Logo size={30} color={theme.onInk} />
      </View>

      <View style={styles.art}>
        <StudyIllustration />
      </View>

      <HeroCard>
        <Text variant="hero" color="onInk" accessibilityRole="header">
          {step === 'email' ? 'Your notes,\nmade clear.' : 'Check your\nemail.'}
        </Text>
        <View style={styles.heroFoot}>
          <Text variant="body" color="mutedOnInk" style={styles.heroText}>
            {step === 'email'
              ? 'Explanations and practice questions from your own slides.'
              : `We sent a ${CODE_LENGTH}-digit code to ${email}. It expires in 10 minutes.`}
          </Text>
          <ArrowDownRight size={32} color={theme.onInk} strokeWidth={2} />
        </View>
      </HeroCard>

      {step === 'email' ? (
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@school.edu.ng"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={sendCode}
        />
      ) : (
        <View style={styles.codeBlock}>
          <CodeField ref={codeRef} value={code} onChangeText={onCodeChange} length={CODE_LENGTH} />
          <TextButton
            label={resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
            onPress={() => run('email', () => sendEmailCode(email).then(() => setResendIn(RESEND_AFTER_S)))}
            color="textSecondary"
            disabled={resendIn > 0 || busy !== null}
          />
        </View>
      )}

      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
  },
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.three,
  },
  heroText: {
    flex: 1,
  },
  codeBlock: {
    gap: Spacing.one,
  },
  legal: {
    textAlign: 'center',
    marginTop: Spacing.one,
  },
});
