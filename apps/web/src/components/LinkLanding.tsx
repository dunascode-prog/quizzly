"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/Icon";

// Screen 24 (DESIGN.md §7): the invite (`/i/{code}`) and share (`/c/{code}`) landing page.
// Routing (FR-INV-02): on Android with the app, the verified App Link opens the app before this page
// loads. Here: Android → Play with the code as install referrer (the app reads it once on first
// launch), or "Open the app"; iPhone → the waitlist; desktop → a QR code to open the link on a phone.

type Kind = "invite" | "share";
type Device = "android" | "ios" | "desktop";
type Person = { name: string | null; institution: string | null; level: string | null };
type Share = Partial<Person> & {
  status: "active" | "gone" | "taken_down" | "unknown";
  owner?: string | null;
  course_code?: string | null;
};
type Preview = { kind: "invite"; inviter: Person | null } | ({ kind: "share" } & Share);

const CODE = /^[A-Za-z0-9]{4,20}$/;

function detect(): Device {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS reports itself as a Mac with touch.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  return "desktop";
}

// The device and the URL never change while the page is open; null while prerendering, so the
// static page is the full landing and the browser fills in the code and the device.
const noSubscribe = () => () => {};
const pathCode = () => window.location.pathname.split("/")[2] ?? "";

function about(p: Partial<Person>): string {
  const parts = [p.institution, p.level].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function LinkLanding({
  kind,
  apiUrl,
  playUrl,
  domain,
  androidPackage,
}: {
  kind: Kind;
  apiUrl: string;
  playUrl: string;
  domain: string;
  androidPackage: string;
}) {
  const raw = useSyncExternalStore<string | null>(noSubscribe, pathCode, () => null);
  const code = raw && CODE.test(raw) ? raw.toUpperCase() : null;
  const device = useSyncExternalStore<Device | null>(noSubscribe, detect, () => null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const segment = kind === "invite" ? "i" : "c";
  const link = code ? `https://${domain}/${segment}/${code}` : `https://${domain}`;
  const referrer = code ? `&referrer=${encodeURIComponent(`${kind}=${code}`)}` : "";
  const store = `${playUrl}${referrer}`;
  // Opens the app when it's installed (Chrome on Android), otherwise falls back to Play.
  const openApp = code
    ? `intent://${domain}/${segment}/${code}#Intent;scheme=https;package=${androidPackage};` +
      `S.browser_fallback_url=${encodeURIComponent(store)};end`
    : store;

  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    fetch(`${apiUrl}/v1/links/${kind}/${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setPreview({ kind, ...data }))
      .catch(() => {}); // No card is fine: the page still works (FRD §4).
    return () => ctrl.abort();
  }, [apiUrl, code, kind]);

  useEffect(() => {
    if (device !== "desktop") return;
    QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [device, link]);

  const share = preview?.kind === "share" ? preview : null;
  const ended = share && (share.status === "gone" || share.status === "taken_down");

  return (
    <div className="link-page wrap">
      <WhoCard preview={preview} />

      {ended ? (
        <p className="link-note" role="status">
          {share.status === "taken_down"
            ? "This course is no longer available."
            : `This course isn't shared any more. Ask ${share.owner ?? "the person who shared it"} for a new link.`}
        </p>
      ) : null}

      <section className="link-hero on-ink" aria-labelledby="link-title">
        <h1 id="link-title" className="disp">
          Your notes, <span className="hl-inv">made clear.</span>
        </h1>
        <ul className="ticks">
          <li>
            <span className="tick"><Icon name="check" size={16} /></span>
            Upload slides or photos of notes
          </li>
          <li>
            <span className="tick"><Icon name="check" size={16} /></span>
            Get clear explanations and exam-style questions
          </li>
          <li>
            <span className="tick"><Icon name="check" size={16} /></span>
            Share courses with coursemates, no re-uploading
          </li>
        </ul>
      </section>

      {device === "desktop" ? (
        <div className="link-qr">
          {qr ? (
            <div
              className="qr"
              role="img"
              aria-label="QR code to open this link on your phone"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : null}
          <p>Scan with your phone to open this link there.</p>
        </div>
      ) : null}

      {device === "ios" ? (
        <Link className="store link-cta" href={`/waitlist${code ? `?invite=${code}` : ""}`}>
          <span className="store-dot"><Icon name="apple" size={22} /></span>
          <span className="store-text">
            <small>Coming soon to iPhone</small>
            <strong>Join the waitlist</strong>
          </span>
        </Link>
      ) : (
        <a className="store link-cta" href={store} rel="noopener">
          <span className="store-dot"><Icon name="download" size={22} strokeWidth={2.2} /></span>
          <span className="store-text">
            <small>Free during beta</small>
            <strong>Get it on Google Play</strong>
          </span>
          <span className="store-arrows" aria-hidden="true">›››</span>
        </a>
      )}

      <div className="link-footer">
        {device === "ios" ? (
          <p>Android: <a href={store} rel="noopener">Get it on Google Play</a></p>
        ) : (
          <p>
            iPhone: coming soon ·{" "}
            <Link href={`/waitlist${code ? `?invite=${code}` : ""}`}>Join the waitlist</Link>
          </p>
        )}
        {device === "android" ? (
          <p>Already have Quizzly? <a href={openApp}>Open the app</a></p>
        ) : null}
      </div>
    </div>
  );
}

function WhoCard({ preview }: { preview: Preview | null }) {
  if (!preview) return null;
  if (preview.kind === "invite") {
    const p = preview.inviter;
    if (!p?.name) return null; // unknown code, or they hide their name
    return (
      <div className="link-who">
        <span className="link-avatar" aria-hidden="true">{initials(p.name)}</span>
        <p>
          <strong>{p.name}</strong>
          {about(p)} invited you to study together on Quizzly
        </p>
      </div>
    );
  }
  if (preview.status !== "active" || !preview.course_code) return null;
  const who = preview.owner;
  return (
    <div className="link-who">
      <span className="link-avatar" aria-hidden="true">{initials(who ?? preview.course_code)}</span>
      <p>
        {who ? (
          <>
            <strong>{who}</strong>
            {about(preview)} shared <strong>{preview.course_code}</strong> with you
          </>
        ) : (
          <>
            <strong>{preview.course_code}</strong> was shared with you
          </>
        )}
      </p>
    </div>
  );
}
