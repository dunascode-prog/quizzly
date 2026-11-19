"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const items: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Overview", icon: "chart" },
  { href: "/admin/costs", label: "AI costs", icon: "sliders" },
  { href: "/admin/reports", label: "Reports", icon: "flag" },
  { href: "/admin/takedowns", label: "Takedowns", icon: "shield" },
  { href: "/admin/limits", label: "Limits and plans", icon: "inbox" },
  { href: "/admin/students", label: "Students", icon: "users" },
  { href: "/admin/system", label: "System", icon: "server" },
];

export function AdminNav({ openReports }: { openReports: number }) {
  const pathname = usePathname();
  return (
    <nav className="a-nav" aria-label="Admin">
      {items.map((item) => {
        const current = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined}>
            <Icon name={item.icon} size={20} />
            <span className="a-nav-label">{item.label}</span>
            {item.href === "/admin/reports" && openReports > 0 && (
              <span className="a-badge" aria-label={`${openReports} open`}>
                {openReports}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
