import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Icon";
import { DOMAIN } from "@/lib/site";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Team sign-in" };

// 30h Team sign-in (docs/reference/admin-sign-in.html).
export default function SignInPage() {
  return (
    <main className="a-signin">
      <div className="a-signin-box">
        <Link href="/" className="a-brand">
          <span className="a-brand-mark" role="img" aria-label="Quizzly">
            <Logo size={24} />
          </span>
          <span className="a-brand-name" style={{ fontSize: 20 }}>
            Quizzly
          </span>
        </Link>
        <h1 className="a-h1">
          Team <span className="a-hl">sign-in</span>
        </h1>
        <div className="a-ink a-signin-note">
          <p>This area is for the Quizzly team only. Students sign in in the app.</p>
          <p>We send a 6-digit code to team emails. Two-step verification is required, and every admin action is logged.</p>
        </div>
        <SignInForm />
        <Link href="/" className="a-back">
          ← Back to {DOMAIN}
        </Link>
      </div>
    </main>
  );
}
