import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Icon, Logo } from "@/components/Icon";
import { DOMAIN } from "@/lib/site";
import { admin, shell } from "@/lib/admin/mock";

// Sidebar shell for every admin page except sign-in (WEB.md §3).
// TODO(E4): check the signed-in user has role = admin before rendering; until then this is sample data only.
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="a-shell">
      <aside className="a-side">
        <Link href="/" className="a-brand">
          <span className="a-brand-mark" role="img" aria-label="Quizzly">
            <Logo size={24} />
          </span>
          <span className="a-brand-text">
            <span className="a-brand-name">Quizzly</span>
            <span className="a-brand-sub">Admin · {DOMAIN}/admin</span>
          </span>
        </Link>
        <AdminNav openReports={shell.openReports} />
        <div className="a-side-foot">
          <div className="a-side-status">
            {shell.status.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <Link href="/admin/sign-in" className="a-me" aria-label={`Sign out ${admin.name}`}>
            <span className="a-avatar" aria-hidden="true">
              {admin.initials}
            </span>
            <span className="a-me-name">
              {admin.name} · {admin.role}
            </span>
            <Icon name="signOut" size={18} />
          </Link>
        </div>
      </aside>
      <main className="a-main">{children}</main>
    </div>
  );
}
