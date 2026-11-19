import type { Metadata } from "next";
import { CostsView } from "./CostsView";
import "./costs.css";

export const metadata: Metadata = { title: "AI costs" };

// 30b AI costs (docs/reference/admin-ai-costs.html): GET /admin/costs.
export default function CostsPage() {
  return <CostsView />;
}
