import type { Metadata } from "next";
import { AdminProvider } from "@/lib/admin/session";
import { API_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/site";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Quizzly admin" },
  robots: { index: false, follow: false },
};

// Team-only area (WEB.md §3). Sign-in has no sidebar; every other page sits in the (console) shell.
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  const config = { apiUrl: API_URL, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY };
  return (
    <div className="adm">
      <AdminProvider config={config}>{children}</AdminProvider>
    </div>
  );
}
