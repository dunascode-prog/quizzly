"use client";

import { isProduction, useAdmin } from "@/lib/admin/session";

// Which environment the admin app is looking at (staging, production). Hidden when there's only one.
// Production is always in the warning colour.
export function EnvSwitch({ onSwitch }: { onSwitch?: () => void }) {
  const { config, environments, switchTo } = useAdmin();
  if (environments.length < 2) return null;
  return (
    <div className="a-env" role="group" aria-label="Environment">
      {environments.map((e) => (
        <button
          key={e.id}
          type="button"
          className={isProduction(e) ? "a-env-prod" : undefined}
          aria-pressed={config.id === e.id}
          onClick={() => {
            if (e.id === config.id) return;
            switchTo(e.id);
            onSwitch?.();
          }}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}

/** A strip across the top of every page while looking at production. */
export function ProductionBanner() {
  const { config } = useAdmin();
  if (!isProduction(config)) return null;
  return (
    <div className="a-prod-banner" role="status">
      You&apos;re looking at <b>{config.label}</b>. Changes here affect real students.
    </div>
  );
}
