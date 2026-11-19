"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The iPhone waitlist (FR-INV-06): an email with consent, confirmed by a link we email (double
// opt-in). The API answers the same whether or not the address was already listed.

async function detail(r: Response): Promise<string> {
  const body = await r.json().catch(() => null);
  const d = body?.detail;
  return typeof d === "string" ? d : Array.isArray(d) ? d[0]?.msg ?? "" : "";
}

export function WaitlistForm({ apiUrl }: { apiUrl: string }) {
  const invite = useSearchParams().get("invite");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const r = await fetch(`${apiUrl}/v1/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, invite_code: invite || null }),
      });
      if (r.ok) return setState("sent");
      setError(r.status === 429 ? "Too many tries. Wait a minute." : (await detail(r)) || "That didn't work. Try again.");
    } catch {
      setError("Check your connection and try again.");
    }
    setState("idle");
  };

  if (state === "sent") {
    return (
      <p className="form-msg ok" role="status">
        Check your inbox. Tap the link we sent to {email} to confirm your place.
      </p>
    );
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <label className="field">
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Email me once when Quizzly is on iPhone. Nothing else, and you can ask us to delete your
        email at any time.
      </label>
      {error ? <p className="form-msg err" role="alert">{error}</p> : null}
      <button className="btn-ink" type="submit" disabled={!consent || !email || state === "sending"}>
        {state === "sending" ? "Sending…" : "Join the waitlist"}
      </button>
    </form>
  );
}

export function WaitlistConfirm({ apiUrl }: { apiUrl: string }) {
  const token = useSearchParams().get("token");
  const [result, setResult] = useState<"working" | "done" | string>("working");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !token) return;
    sent.current = true;
    fetch(`${apiUrl}/v1/waitlist/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => setResult(r.ok ? "done" : (await detail(r)) || "That didn't work. Try again."))
      .catch(() => setResult("Check your connection and try again."));
  }, [apiUrl, token]);

  if (!token) {
    return (
      <p className="form-msg err" role="alert">
        This link is missing its code. Open it from the email again.
      </p>
    );
  }
  if (result === "working") return <p role="status">Confirming…</p>;
  if (result === "done") {
    return (
      <p className="form-msg ok" role="status">
        You&apos;re on the list. We&apos;ll email you once when Quizzly is on iPhone.
      </p>
    );
  }
  return <p className="form-msg err" role="alert">{result}</p>;
}
