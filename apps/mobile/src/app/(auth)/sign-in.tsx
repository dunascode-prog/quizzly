import { router } from 'expo-router';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { StyleSheet, type TextInput, useWindowDimensions, View } from 'react-native';

import { ArrowRight, ArrowUp, ArrowUpRight, BookOpen, Check } from '@/components/icons';
import { Logo } from '@/components/logo';
import { StudyIllustration } from '@/components/study-illustration';
import { ActionPill } from '@/components/ui/action-pill';
import { Banner } from '@/components/ui/banner';
import { CodeField } from '@/components/ui/code-field';
import { FeatureList } from '@/components/ui/feature-list';
import { HeroCard } from '@/components/ui/hero-card';
import { Screen } from '@/components/ui/screen';
import { Sticker } from '@/components/ui/sticker';
import { Text } from '@/components/ui/text';
import { TextButton } from '@/components/ui/text-button';
import { TextField } from '@/components/ui/text-field';
import { Radius, Size, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sendEmailCode, SignInCancelled, signInWithGoogle, verifyEmailCode } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';

const ART_RATIO = 340 / 230; // study-illustration viewBox
const ART_MAX_WIDTH = 320;
const ART_MIN_HEIGHT = 72; // below this the art is too small to read, so it's hidden
const ART_MIN_HEIGHT_COMPACT = 48; // small phones keep a smaller illustration (01d)
const STICKERS_MIN_HEIGHT = 200; // the stickers sit above and below the art, so they need room
// Small phones (DESIGN.md §7 01, v0.4.1): compact under 740 dp, no illustration under 600 dp or at
// large font sizes. The card, the pill, the two text buttons and the terms always fit.
const COMPACT_BELOW = 740;
const NO_ART_BELOW = 600;
const NO_ART_FONT_SCALE = 1.3;
const CODE_LENGTH = 6;
const RESEND_AFTER_S = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FEATURES = [
  { verb: 'Upload', rest: 'slides or note photos' },
  { verb: 'Understand', rest: 'it in plain English' },
  { verb: 'Practise', rest: 'exam-style questions' },
  { verb: 'Check', rest: 'the page every answer cites' },
];

type Step = 'welcome' | 'email' | 'code';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Screen 01 (DESIGN.md §7): welcome → email → 6-digit code, or Google (FR-AUTH-01). Monochrome:
// no accent colours on sign-in.
export default function SignInScreen() {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('welcome');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'email' | 'code' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [art, setArt] = useState<{ width: number; stickers: boolean }>();
  const window = useWindowDimensions();
  const compact = window.height < COMPACT_BELOW;
  const noArt = window.height < NO_ART_BELOW || window.fontScale > NO_ART_FONT_SCALE;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const go = (to: Step) => {
    setError(null);
    setStep(to);
  };

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

  const resend = () => run('email', () => sendEmailCode(email).then(() => setResendIn(RESEND_AFTER_S)));

  // On success the auth listener updates the session and the root layout moves on.
  const verify = (value = code) => {
    if (value.length !== CODE_LENGTH || busy) return;
    run('code', () => verifyEmailCode(email, value));
  };

  const onCodeChange = (value: string) => {
    setCode(value);
    if (value.length === CODE_LENGTH) verify(value);
  };

  const legal = (
    <Text variant="caption" color="textSecondary" style={styles.legal}>
      By continuing you agree to the{' '}
      <Text variant="caption" style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal')}>
        Terms
      </Text>{' '}
      and{' '}
      <Text variant="caption" style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal')}>
        Privacy Policy
      </Text>
      .
    </Text>
  );

  const footer =
    step === 'welcome' ? (
      <>
        <ActionPill label="Get started" icon={BookOpen} variant="light" onPress={() => go('email')} />
        <View style={styles.pair}>
          <TextButton compact label="Continue with Google" onPress={() => run('google', signInWithGoogle)} disabled={busy !== null} />
          <TextButton compact label="I have an account" color="textSecondary" onPress={() => go('email')} disabled={busy !== null} />
        </View>
        {legal}
      </>
    ) : step === 'email' ? (
      <>
        <ActionPill
          label="Send my code"
          icon={ArrowRight}
          variant="light"
          onPress={sendCode}
          loading={busy === 'email'}
          disabled={busy !== null && busy !== 'email'}
        />
        <TextButton label="Back" onPress={() => go('welcome')} disabled={busy !== null} />
        {legal}
      </>
    ) : (
      <>
        <ActionPill
          label="Verify"
          icon={Check}
          variant="light"
          onPress={() => verify()}
          loading={busy === 'code'}
          disabled={code.length !== CODE_LENGTH}
        />
        <View style={styles.pair}>
          <TextButton compact label="Use a different email" onPress={() => go('email')} disabled={busy !== null} />
          <TextButton
            compact
            label={resendIn > 0 ? `Resend in ${clock(resendIn)}` : 'Resend code'}
            color="textSecondary"
            onPress={resend}
            disabled={resendIn > 0 || busy !== null}
          />
        </View>
        {legal}
      </>
    );

  return (
    <Screen footer={footer} fit>
      <View style={[styles.logo, { backgroundColor: theme.text }]}>
        <Logo size={30} color={theme.onInk} />
      </View>

      {/* Takes only the height left over, so the field shows without scrolling. */}
      {noArt ? null : (
        <View
          style={styles.art}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Quizzly turns your slides into exam questions, with the page each answer comes from."
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            const stickers = height >= STICKERS_MIN_HEIGHT;
            // With stickers, leave a little room for them; they may overlap the art's edges.
            const room = stickers ? height - Size.sticker : height;
            setArt({
              width:
                height < (compact ? ART_MIN_HEIGHT_COMPACT : ART_MIN_HEIGHT)
                  ? 0
                  : Math.min(width, ART_MAX_WIDTH, room * ART_RATIO),
              stickers,
            });
          }}>
          {art?.width ? <StudyIllustration width={art.width} /> : null}
          {art?.stickers && !compact ? (
            <>
              <Sticker label="Slides in" icon={ArrowUp} tilt={-6} delay={0} style={styles.topLeft} />
              <Sticker label="20 exam questions" icon={Check} tone="ink" tilt={5} delay={150} style={styles.topRight} />
              <Sticker label="Cited from page 14" icon="p." tilt={-4} delay={300} style={styles.bottomRight} />
            </>
          ) : null}
        </View>
      )}

      <HeroCard style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroTop}>
          <Text
            variant="hero"
            color="onInk"
            accessibilityRole="header"
            style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
            {'Your notes,\nexam-ready.'}
          </Text>
          <ArrowUpRight size={32} color={theme.onInk} strokeWidth={2} />
        </View>
        {step === 'welcome' ? <FeatureList items={FEATURES} compact={compact} /> : null}
      </HeroCard>

      {step === 'email' ? (
        <TextField
          label="Email · we'll send a 6-digit code"
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
          autoFocus
        />
      ) : null}
      {step === 'code' ? (
        <CodeField ref={codeRef} value={code} onChangeText={onCodeChange} length={CODE_LENGTH} />
      ) : null}

      {error ? <Banner message={error} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    flexGrow: 1,
    flexBasis: 0,
    flexShrink: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topLeft: { top: 0, left: 0 },
  topRight: { top: 0, right: 0 },
  bottomRight: { bottom: 0, right: 0 },
  hero: { borderRadius: Radius.hero, paddingTop: Spacing.four, paddingHorizontal: 22, paddingBottom: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  heroTitle: { flex: 1 },
  heroCompact: { padding: 20 },
  heroTitleCompact: { fontSize: 36, lineHeight: 38 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  legal: { textAlign: 'center', marginTop: Spacing.one },
  link: { textDecorationLine: 'underline' },
});
