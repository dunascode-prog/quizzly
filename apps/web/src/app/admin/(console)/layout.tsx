import { DOMAIN } from "@/lib/site";
import { ConsoleShell } from "./ConsoleShell";

// Every admin page except sign-in: the sidebar shell, shown only to an admin with 2FA (WEB.md §3).
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell domain={DOMAIN}>{children}</ConsoleShell>;
}
