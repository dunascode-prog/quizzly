"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

// Email → 6-digit code. TODO(E4): send the code with Supabase Auth OTP, then require the TOTP step and
// check role = admin in app_metadata. Until the admin API exists this only walks through the screens.
export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter your team email.");
      setError("");
      setStep("code");
      return;
    }
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    router.push("/admin");
  }

  return (
    <form className="a-stack" style={{ gap: 20 }} onSubmit={submit} noValidate>
      {step === "email" ? (
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
      ) : (
        <label className="a-field">
          <span className="a-field-label">6-digit code sent to {email.trim()}</span>
          <input
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
      <button type="submit" className="a-action">
        <span className="a-action-circle">
          <Icon name="arrowRight" size={22} strokeWidth={2.2} />
        </span>
        <span className="a-action-label">{step === "email" ? "Send my code" : "Sign in"}</span>
        <span className="a-action-chev" aria-hidden="true">
          ›››
        </span>
      </button>
      {step === "code" && (
        <button
          type="button"
          className="a-back"
          style={{ background: "none" }}
          onClick={() => {
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
