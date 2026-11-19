import type { Metadata } from "next";
import { SystemView } from "./SystemView";
import "./system.css";

export const metadata: Metadata = { title: "System" };

// 30g System health (docs/reference/admin-system.html): GET /admin/system.
export default function SystemPage() {
  return <SystemView />;
}
