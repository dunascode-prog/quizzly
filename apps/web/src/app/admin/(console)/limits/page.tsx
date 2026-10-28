import type { Metadata } from "next";
import { PageHead } from "@/components/admin/ui";
import { LimitsForm } from "./LimitsForm";
import "./limits.css";

export const metadata: Metadata = { title: "Limits and plans" };

// 30e Limits and plans (docs/reference/admin-limits-plans.html). Data: app_config and config_audit, once the admin API exists.
export default function LimitsPage() {
  return (
    <>
      <PageHead eyebrow="Usage limits, safety limits and features" title="Limits and " highlight="plans" />
      <LimitsForm />
    </>
  );
}
