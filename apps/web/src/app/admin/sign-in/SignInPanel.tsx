"use client";

import { useRouter } from "next/navigation";
import { isProduction, useAdmin } from "@/lib/admin/session";
import { SignInForm } from "./SignInForm";

// Sign-in for the environment in use: the last one chosen, or the first. Environments are chosen
// in the console once signed in; switching to one you aren't signed in to lands here, with the way
// back to where you came from. Each environment has its own team accounts and authenticator.
export function SignInPanel() {
  const { config, environments, previous, switchTo } = useAdmin();
  const router = useRouter();
  return (
    <>
      {environments.length > 1 && (
        <div className="a-stack" style={{ gap: 8 }}>
          <p className={isProduction(config) ? "a-error" : "a-muted"}>
            Signing in to <b>{config.label}</b>.
          </p>
          {previous && (
            <button
              type="button"
              className="a-back"
              style={{ background: "none", alignSelf: "flex-start" }}
              onClick={() => {
                switchTo(previous.id);
                router.replace("/admin");
              }}
            >
              ← Back to {previous.label}
            </button>
          )}
        </div>
      )}
      <SignInForm key={config.id} />
    </>
  );
}
