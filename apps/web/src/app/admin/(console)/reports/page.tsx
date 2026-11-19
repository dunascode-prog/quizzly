import type { Metadata } from "next";
import { ReportsQueue } from "./ReportsQueue";
import "./reports.css";

export const metadata: Metadata = { title: "Reports" };

// 30c Reports queue (docs/reference/admin-reports.html): GET /admin/reports and its actions.
export default function ReportsPage() {
  return <ReportsQueue />;
}
