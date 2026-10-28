"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/admin/ui";
import { usd } from "@/lib/admin/format";
import { flaggedCount, schoolFilters, type Student } from "./data";

type Filter = "all" | "flagged" | string;

// Searchable student table. Filters locally over the loaded rows.
// TODO(E4): search and filter on the server (email search needs it: emails are never sent to the page).
export function StudentsTable({ students }: { students: Student[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (filter === "flagged" ? !s.flagged : filter !== "all" && s.school !== filter) return false;
      return !q || [s.name ?? "", s.id, s.school].some((t) => t.toLowerCase().includes(q));
    });
  }, [students, query, filter]);

  return (
    <section className="a-card" aria-label="Students">
      <div className="st-tools">
        <label className="a-search st-search">
          <Icon name="search" size={18} />
          <span className="sr-only">Search students</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by display name, ID or email" />
        </label>
        <div className="a-filters" role="group" aria-label="Filter by school">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All schools
          </button>
          {schoolFilters.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.value} {f.count}
            </button>
          ))}
          <button type="button" aria-pressed={filter === "flagged"} onClick={() => setFilter("flagged")}>
            Flagged {flaggedCount}
          </button>
        </div>
      </div>

      <div className="a-table-wrap">
        <table className="a-table a-nw st-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>School</th>
              <th>Plan</th>
              <th>Last active</th>
              <th className="a-r">Quiz sets (30 d)</th>
              <th className="a-r">AI cost (30 d)</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="st-who">
                    <span className="st-initial" aria-hidden="true">
                      {s.name ? s.name[0] : "?"}
                    </span>
                    <span className="st-name">
                      <b>{s.name ?? <span aria-label="Name removed">—</span>}</b>
                      <span className="st-id">{s.id}</span>
                    </span>
                  </span>
                </td>
                <td>
                  {s.school} · {s.level}
                </td>
                <td>
                  <Chip>{s.plan}</Chip>
                </td>
                <td>{s.lastActive ?? "—"}</td>
                <td className="a-r">{s.quizSets ?? "—"}</td>
                <td className="a-r">{s.aiCost === null ? "—" : usd(s.aiCost)}</td>
                <td>
                  <Chip tone={s.status.tone}>{s.status.text}</Chip>
                </td>
                <td className="a-r">
                  {/* TODO(E4): open the student; every view is written to admin_audit_log. */}
                  <button type="button" className="a-btn" aria-label={`View ${s.name ?? "student"} ${s.id}`}>
                    View
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="st-empty">
                  No students match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
