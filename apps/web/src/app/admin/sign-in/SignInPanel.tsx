"use client";

import { EnvSwitch } from "@/components/admin/EnvSwitch";
import { isProduction, useAdmin } from "@/lib/admin/session";
import { SignInForm } from "./SignInForm";

// The environment to sign in to, then the form for it. Each environment is its own Supabase
// project, with its own team accounts and authenticator.
export function SignInPanel() {
  const { config, environments } = useAdmin();
  return (
    <>
      {environments.length > 1 && (
        <div className="a-stack" style={{ gap: 8 }}>
          <EnvSwitch />
          <p className={isProduction(config) ? "a-error" : "a-muted"}>
            Signing in to <b>{config.label}</b>. Each environment has its own team accounts.
          </p>
        </div>
      )}
      <SignInForm key={config.id} />
    </>
  );
}
