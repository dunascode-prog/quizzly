"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { NOT_CONFIGURED, useAdmin } from "@/lib/admin/session";

// 30h: team email → 6-digit email code → authenticator code (TOTP). The first sign-in sets the
// authenticator up with a QR code. Only accounts with app_metadata.role = admin get past the code;
// the API checks the same on every request, so this form is only the way in, not the lock.

type Step = "email" | "code" | "enroll" | "totp";
const NOT_TEAM = "This is for the Quizzly team only.";

export function SignInForm() {
  const router = useRouter();
  const { client } = useAdmin();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [factor, setFactor] = useState<{ id: string; qr?: string; secret?: string } | null>(null);

  if (!client) return <p className="a-error">{NOT_CONFIGURED}</p>;
  const auth = client.auth;

  async function secondFactor() {
    const { data: factors, error: listError } = await auth.mfa.listFactors();
    if (listError) throw listError;
    const verified = factors.totp[0];
    if (verified) {
      setFactor({ id: verified.id });
      setStep("totp");
      return;
    }
    // An earlier set-up that wasn't finished would block a new one: remove it first.
    for (const f of factors.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
      await auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: enrollError } = await auth.mfa.enroll({ factorType: "totp", friendlyName: "Quizzly admin" });
    if (enrollError) throw enrollError;
    setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setStep("enroll");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (step === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter your team email.");
        // Team accounts already exist: never create one from this form.
        const { error: otpError } = await auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
        if (otpError) throw otpError;
        setStep("code");
      } else if (step === "code") {
        if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
        const { data, error: verifyError } = await auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
        if (verifyError) throw verifyError;
        if (data.user?.app_metadata?.role !== "admin") {
          await auth.signOut();
          setStep("email");
          return setError(NOT_TEAM);
        }
        setCode("");
        await secondFactor();
      } else if (factor) {
        if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
        const { error: mfaError } = await auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (mfaError) throw mfaError;
        router.replace("/admin");
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  const label = { email: "Send my code", code: "Continue", enroll: "Turn on and sign in", totp: "Sign in" }[step];

  return (
    <form className="a-stack" style={{ gap: 20 }} onSubmit={submit} noValidate>
      {step === "email" && (
        <label className="a-field">
          <span className="a-field-label">Team email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signin-error" : undefined}
            autoFocus
          />
        </label>
      )}
      {step === "enroll" && factor?.qr && (
        <div className="a-stack a-enroll" style={{ gap: 12 }}>
          <p>Two-step verification is required. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password), then enter the code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a one-off data URL from Supabase */}
          <img src={factor.qr} alt="QR code to add Quizzly admin to your authenticator app" width={180} height={180} />
          <p className="a-muted">
            Can&apos;t scan? Enter this key: <code>{factor.secret}</code>
          </p>
        </div>
      )}
      {step !== "email" && (
        <label className="a-field">
          <span className="a-field-label">
            {step === "code" ? `6-digit code sent to ${email.trim()}` : "6-digit code from your authenticator app"}
          </span>
          <input
            key={step}
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signin-error" : undefined}
            autoFocus
          />
        </label>
      )}
      {error && (
        <p id="signin-error" className="a-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="a-action" disabled={busy}>
        <span className="a-action-circle">
          <Icon name="arrowRight" size={22} strokeWidth={2.2} />
        </span>
        <span className="a-action-label">{busy ? "One moment…" : label}</span>
        <span className="a-action-chev" aria-hidden="true">
          ›››
        </span>
      </button>
      {step !== "email" && (
        <button
          type="button"
          className="a-back"
          style={{ background: "none" }}
          onClick={async () => {
            await auth.signOut();
            setStep("email");
            setCode("");
            setError("");
          }}
        >
          Use a different email
        </button>
      )}
    </form>
  );
}

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/signups? not allowed|user not found/i.test(msg)) return NOT_TEAM;
  if (/expired|invalid/i.test(msg)) return "That code didn't work. Check it and try again.";
  if (/rate|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  return msg || "Sign-in didn't work. Try again.";
}
