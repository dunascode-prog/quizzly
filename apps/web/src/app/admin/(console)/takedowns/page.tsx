import type { Metadata } from "next";
import { Takedowns } from "./Takedowns";
import "./takedowns.css";

export const metadata: Metadata = { title: "Takedowns" };

// 30d Takedowns (docs/reference/admin-takedowns.html): GET/POST /admin/takedowns (FR-MOD-04/05).
export default function TakedownsPage() {
  return <Takedowns />;
}
