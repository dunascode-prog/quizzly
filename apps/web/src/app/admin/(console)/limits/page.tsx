import type { Metadata } from "next";
import { PageHead } from "@/components/admin/ui";
import { LimitsForm } from "./LimitsForm";
import "./limits.css";

export const metadata: Metadata = { title: "Limits and plans" };

// 30e Limits and plans (docs/reference/admin-limits-plans.html): GET and PUT /admin/limits.
export default function LimitsPage() {
  return (
    <>
      <PageHead eyebrow="Daily limits, storage, AI allowances and safety limits" title="Limits and " highlight="plans" />
      <LimitsForm />
    </>
  );
}
