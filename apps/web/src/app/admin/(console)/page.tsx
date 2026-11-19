import type { Metadata } from "next";
import { OverviewView } from "./OverviewView";
import "./overview.css";

export const metadata: Metadata = { title: "Overview" };

// 30a Overview (docs/reference/admin-overview.html): GET /admin/overview.
export default function OverviewPage() {
  return <OverviewView />;
}
