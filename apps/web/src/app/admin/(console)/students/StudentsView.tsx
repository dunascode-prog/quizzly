"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { DataState } from "@/components/admin/DataState";
import { CardHead, Chip, PageHead, Tiles, type TileData, type Tone } from "@/components/admin/ui";
import type { StudentRow, StudentsSummary } from "@/lib/admin/api";
import { num, pct, shortDate, usd } from "@/lib/admin/format";
import { useAdminData } from "@/lib/admin/session";

const SOURCE: Record<string, string> = {
  link: "Invite links",
  play_referrer: "Invite links (Play Store install)",
  share_link: "Shared course links",
};
const STATUS: Record<StudentRow["status"], { text: string; tone: Tone }> = {
  active: { text: "Active", tone: "success" },
  paused: { text: "Paused (abuse check)", tone: "warning" },
  deleting: { text: "Deleting · 24 h", tone: "outline" },
};

function tiles(s: StudentsSummary): TileData[] {
  return [
    { label: "Active this month", value: num(s.active_month), ink: true },
    { label: "Active today", value: num(s.active_today) },
    { label: "New this week", value: num(s.new_week), note: `${num(s.invited_week)} via invites` },
    { label: "Met weekly goal", value: pct(s.goal_met_share), note: "this week, target 35%" },
    { label: "Week-4 retention", value: pct(s.week4_retention), note: "joined 4–5 weeks ago" },
  ];
}

function lastActive(day: string | null) {
  if (!day) return "—";
  const days = Math.round((Date.now() - new Date(`${day}T12:00:00Z`).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 14 ? `${days} days ago` : shortDate(`${day}T12:00:00Z`);
}

function exportCsv(rows: StudentRow[]) {
  // No names or emails (WEB.md §3): IDs, school, plan, activity, usage and status only.
  const lines = [
    "student_id,school,level,plan,joined,last_active,quiz_sets_30d,ai_cost_month_usd,status",
    ...rows.map((s) =>
      [s.id, s.school ?? "", s.level ?? "", s.plan, s.created_at.slice(0, 10), s.last_active ?? "", s.quiz_sets, s.ai_cost_usd ?? "", s.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  Object.assign(document.createElement("a"), { href: url, download: "quizzly-students.csv" }).click();
  URL.revokeObjectURL(url);
}

// 30f Students (docs/reference/admin-students.html), from GET /admin/students/summary and /admin/students.
export function StudentsView() {
  const summary = useAdminData<StudentsSummary>("/admin/students/summary");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [school, setSchool] = useState<string | null>(null);
  const [pausedOnly, setPausedOnly] = useState(false);

  // Search on the server, a moment after typing stops (each search is written to the audit log).
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const params = new URLSearchParams({ limit: "100" });
  if (search) params.set("search", search);
  if (school) params.set("school", school);
  const list = useAdminData<StudentRow[]>(`/admin/students?${params}`);
  const rows = (list.data ?? []).filter((s) => !pausedOnly || s.status === "paused");

  const s = summary.data;
  const total = s ? s.schools.reduce((n, x) => n + x.students, 0) : 0;
  const topSchools = s ? s.schools.filter((x) => x.name !== "Other").slice(0, 4) : [];
  const newWeek = s?.new_week ?? 0;
  const sources = s
    ? [
        ...s.sources.map((x) => ({ name: SOURCE[x.channel] ?? x.channel, n: x.n })),
        { name: "Other (store search, word of mouth)", n: Math.max(0, newWeek - s.sources.reduce((n, x) => n + x.n, 0)) },
      ]
    : [];

  return (
    <>
      <PageHead
        eyebrow={s ? `${num(s.active_month)} active this month` : "Students"}
        title="Stu"
        highlight="dents"
        action={
          <button type="button" className="a-btn" onClick={() => exportCsv(rows)} disabled={!rows.length}>
            <Icon name="download" size={16} />
            Export CSV
          </button>
        }
      />
      <DataState loading={summary.loading && !s} error={summary.error} onRetry={summary.reload} />
      {s && <Tiles tiles={tiles(s)} />}

      {s && (
        <div className="st-grid">
          <section className="a-card" aria-labelledby="st-schools">
            <CardHead title="Schools" />
            <table className="a-table" id="st-schools">
              <thead>
                <tr>
                  <th>School</th>
                  <th className="a-r">Students</th>
                  <th className="a-r">Share</th>
                </tr>
              </thead>
              <tbody>
                {s.schools.slice(0, 8).map((x) => (
                  <tr key={x.name}>
                    <td>{x.name}</td>
                    <td className="a-r">{num(x.students)}</td>
                    <td className="a-r">{total ? Math.round((x.students / total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="a-card" aria-labelledby="st-sources">
            <CardHead title="Where new students come from" sub="Last 7 days" />
            <table className="a-table" id="st-sources">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="a-r">This week</th>
                  <th className="a-r">Share</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((x) => (
                  <tr key={x.name}>
                    <td>{x.name}</td>
                    <td className="a-r">{num(x.n)}</td>
                    <td className="a-r">{newWeek ? Math.round((x.n / newWeek) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      <section className="a-card" aria-label="Students">
        <div className="st-tools">
          <label className="a-search st-search">
            <Icon name="search" size={18} />
            <span className="sr-only">Search students</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by display name or ID" />
          </label>
          <div className="a-filters" role="group" aria-label="Filter by school">
            <button type="button" aria-pressed={!school && !pausedOnly} onClick={() => (setSchool(null), setPausedOnly(false))}>
              All schools
            </button>
            {topSchools.map((x) => (
              <button key={x.name} type="button" aria-pressed={school === x.name} onClick={() => (setSchool(x.name), setPausedOnly(false))}>
                {x.name} {num(x.students)}
              </button>
            ))}
            <button type="button" aria-pressed={pausedOnly} onClick={() => setPausedOnly((p) => !p)}>
              Paused
            </button>
          </div>
        </div>

        <DataState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} />
        <div className="a-table-wrap">
          <table className="a-table a-nw st-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>School</th>
                <th>Plan</th>
                <th>Last active</th>
                <th className="a-r">Quiz sets (30 d)</th>
                <th className="a-r">AI cost (month)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="st-who">
                      <span className="st-initial" aria-hidden="true">
                        {r.name ? r.name[0] : "?"}
                      </span>
                      <span className="st-name">
                        <b>{r.name ?? <span aria-label="Name removed">—</span>}</b>
                        <span className="st-id" title={r.id}>
                          #{r.id.slice(0, 4).toUpperCase()}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td>{[r.school, r.level].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <Chip>{r.plan}</Chip>
                  </td>
                  <td>{lastActive(r.last_active)}</td>
                  <td className="a-r">{num(r.quiz_sets)}</td>
                  <td className="a-r">{r.ai_cost_usd === null ? "—" : usd(r.ai_cost_usd)}</td>
                  <td>
                    <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Chip>
                  </td>
                </tr>
              ))}
              {list.data && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="st-empty">
                    No students match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="st-privacy">
        <Icon name="info" size={16} />
        <span>
          Admins see display names, school, usage and status only. Notes, chats, answers, progress and emails are never shown here. Every
          search of this list is logged.
        </span>
      </p>
    </>
  );
}
