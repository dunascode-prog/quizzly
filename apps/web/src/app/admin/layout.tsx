import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Quizzly admin" },
  robots: { index: false, follow: false },
};

// Team-only area (WEB.md §3). Sign-in has no sidebar; every other page sits in the (console) shell.
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return <div className="adm">{children}</div>;
}
