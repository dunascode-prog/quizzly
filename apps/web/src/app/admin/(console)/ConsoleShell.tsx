"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { Icon, Logo } from "@/components/Icon";
import type { Overview } from "@/lib/admin/api";
import { AdminGate, useAdmin, useAdminData } from "@/lib/admin/session";

// Sidebar shell for every admin page except sign-in (WEB.md §3). Shown only to an admin with 2FA.
export function ConsoleShell({ domain, children }: { domain: string; children: React.ReactNode }) {
  return (
    <AdminGate>
      {(session) => (
        <Shell domain={domain} email={session.user.email ?? "Admin"}>
          {children}
        </Shell>
      )}
    </AdminGate>
  );
}

function Shell({ domain, email, children }: { domain: string; email: string; children: React.ReactNode }) {
  const { client } = useAdmin();
  const router = useRouter();
  const { data } = useAdminData<Overview>("/admin/overview?range=30d");
  const breakers = data?.health.breakers.filter((b) => b.open).length ?? 0;
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="a-shell">
      <aside className="a-side">
        <Link href="/" className="a-brand">
          <span className="a-brand-mark" role="img" aria-label="Quizzly">
            <Logo size={24} />
          </span>
          <span className="a-brand-text">
            <span className="a-brand-name">Quizzly</span>
            <span className="a-brand-sub">Admin · {domain}/admin</span>
          </span>
        </Link>
        <AdminNav openReports={data?.open_reports ?? 0} />
        <div className="a-side-foot">
          <div className="a-side-status">
            {data ? (
              <>
                <div>Beta · {data.active_month} active students</div>
                <div>{breakers ? `AI providers: ${breakers} paused` : "AI providers: all healthy"}</div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            className="a-me"
            aria-label={`Sign out ${email}`}
            onClick={async () => {
              await client?.auth.signOut();
              router.replace("/admin/sign-in");
            }}
          >
            <span className="a-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="a-me-name">{email}</span>
            <Icon name="signOut" size={18} />
          </button>
        </div>
      </aside>
      <main className="a-main">{children}</main>
    </div>
  );
}
