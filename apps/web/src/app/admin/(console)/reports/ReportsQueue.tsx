"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/admin/ui";
import { counts, type Kind, type Report } from "./data";

type Filter = "all" | Kind | "hidden";

const filters: { value: Filter; label: string; count: number }[] = [
  { value: "all", label: "All", count: counts.all },
  { value: "Question", label: "Questions", count: counts.Question },
  { value: "Explanation", label: "Explanations", count: counts.Explanation },
  { value: "Chat answer", label: "Chat answers", count: counts["Chat answer"] },
  { value: "hidden", label: "Auto-hidden", count: counts.hidden },
  { value: "Shared course", label: "Shared courses", count: counts["Shared course"] },
];

const letter = (i: number) => String.fromCharCode(65 + i);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Reports queue: filter pills, a searchable list on the left and the selected report on the right.
// Actions only change local state. TODO(E4): POST /admin/reports/{id}/fix|regenerate|keep-hidden|dismiss.
export function ReportsQueue({ reports: initial }: { reports: Report[] }) {
  const [reports, setReports] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initial[0]?.id);
  const [done, setDone] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (filter === "hidden" ? !r.hidden : filter !== "all" && r.kind !== filter) return false;
      if (!q) return true;
      return [r.id, r.note ?? "", r.context, ...r.reporters.map((p) => p.note ?? "")].some((t) => t.toLowerCase().includes(q));
    });
  }, [reports, filter, query]);

  const selected = visible.find((r) => r.id === selectedId) ?? visible[0];

  function resolve(r: Report, message: string, restore = false) {
    setDone((d) => ({ ...d, [r.id]: message }));
    if (restore) setReports((all) => all.map((x) => (x.id === r.id ? { ...x, hidden: false, hiddenSince: undefined } : x)));
  }

  return (
    <>
      <div className="a-filters" role="group" aria-label="Filter reports">
        {filters.map((f) => (
          <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label} {f.count}
          </button>
        ))}
      </div>

      <div className="rp-layout">
        <div className="rp-list">
          <label className="a-search rp-search">
            <Icon name="search" size={18} />
            <span className="sr-only">Search reports</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes, course, ID" />
          </label>
          {visible.length === 0 && <p className="rp-empty">Nothing here right now.</p>}
          {visible.map((r) => (
            <button
              key={r.id}
              type="button"
              className="rp-item"
              aria-pressed={selected?.id === r.id}
              onClick={() => setSelectedId(r.id)}
            >
              <span className="rp-item-tags">
                <span className="a-chip rp-kind">{r.kind}</span>
                <StatusChip report={r} resolved={!!done[r.id]} />
              </span>
              <span className="rp-item-title">
                {r.reason} · {plural(r.reporters.length, "report")}
              </span>
              <span className="rp-item-note">
                {r.note ?? "No note"} · {r.date}
              </span>
            </button>
          ))}
        </div>

        {selected ? (
          <Detail key={selected.id} report={selected} message={done[selected.id]} onResolve={resolve} />
        ) : (
          <section className="a-card rp-detail rp-empty">Choose a report to see it here.</section>
        )}
      </div>
    </>
  );
}

function StatusChip({ report, resolved }: { report: Report; resolved: boolean }) {
  if (resolved) return <Chip tone="success">Resolved</Chip>;
  return report.hidden ? <Chip tone="warning">Auto-hidden</Chip> : <Chip tone="outline">Open</Chip>;
}

function Detail({
  report: r,
  message,
  onResolve,
}: {
  report: Report;
  message?: string;
  onResolve: (r: Report, message: string, restore?: boolean) => void;
}) {
  const item = r.item;
  const n = r.reporters.length;
  const canFix = item.type === "question" && item.notes !== undefined && item.notes !== item.stored;
  const regenerate = r.kind === "Chat answer" || r.kind === "Shared course" ? null : `Regenerate ${r.kind.toLowerCase()}`;

  return (
    <section className="a-card rp-detail" aria-labelledby="rp-title">
      <div className="rp-tags">
        <span className="a-chip">{item.type === "question" ? `Question · ${item.format}` : item.label}</span>
        {r.hidden && <Chip tone="warning">Auto-hidden since {r.hiddenSince}</Chip>}
      </div>
      <h2 id="rp-title" className="rp-title">
        {item.type === "question" ? item.text : `${r.reason} ${r.kind.toLowerCase()}`}
      </h2>
      <span className="a-sub">{r.context}</span>

      {item.type === "question" ? (
        <ol className="rp-options" aria-label="Options">
          {item.options.map((o, i) => {
            const isNotes = item.notes === i && canFix;
            const isStored = item.stored === i;
            const cls = isNotes ? " rp-ok" : isStored && canFix ? " rp-bad" : "";
            return (
              <li key={o} className={`rp-option${cls}`}>
                <span className="rp-letter" aria-hidden="true">
                  {letter(i)}
                </span>
                <span className="sr-only">{letter(i)}.</span>
                <span className="rp-option-text">{o}</span>
                {isNotes && <span className="rp-option-tag">What the notes say</span>}
                {isStored && <span className="rp-option-tag">Stored answer</span>}
              </li>
            );
          })}
        </ol>
      ) : (
        <blockquote className="rp-text">{item.text}</blockquote>
      )}

      {r.source && (
        <div className="a-ink rp-source">
          <span className="a-kicker">Source cited · p. {r.source.page}</span>
          <p>&ldquo;{r.source.quote}&rdquo;</p>
          <span className="a-muted rp-small">{r.source.check}</span>
        </div>
      )}

      <div className="rp-reporters">
        <h3 className="rp-h3">
          {plural(n, "report")} from {plural(n, "student")}
        </h3>
        <ol>
          {r.reporters.map((p, i) => (
            <li key={i}>
              <span className="rp-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="rp-rep">
                <span>{p.note ?? "No note"}</span>
                <span className="rp-small a-muted">
                  {p.who} · {p.when}
                  {p.extra && ` · ${p.extra}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {message ? (
        <p className="rp-done" role="status">
          <Icon name="check" size={16} strokeWidth={2.6} />
          {message}
        </p>
      ) : (
        <>
          <div className="rp-actions">
            {canFix && item.type === "question" && (
              <button
                type="button"
                className="a-btn a-btn-ink"
                onClick={() =>
                  onResolve(r, `Answer fixed to ${letter(item.notes!)}. ${r.answers ?? 0} past answers re-marked and ${plural(n, "reporter")} thanked.`, true)
                }
              >
                <Icon name="check" size={16} />
                Fix answer to {letter(item.notes!)}
              </button>
            )}
            {regenerate && (
              <button type="button" className="a-btn a-btn-ghost" onClick={() => onResolve(r, `Regenerating. The new ${r.kind.toLowerCase()} replaces this one everywhere it's used.`)}>
                <Icon name="refresh" size={16} />
                {regenerate}
              </button>
            )}
            {r.hidden && (
              <button type="button" className="a-btn a-btn-ghost" onClick={() => onResolve(r, "Kept hidden. Students won't see it again.")}>
                <Icon name="eyeOff" size={16} />
                Keep hidden
              </button>
            )}
          </div>
          <button type="button" className="rp-dismiss" onClick={() => onResolve(r, r.hidden ? "Dismissed and restored." : "Dismissed.", true)}>
            {r.hidden ? "Dismiss and restore" : "Dismiss"}
          </button>
          {canFix && (
            <span className="a-sub rp-small">
              Fixing the answer re-marks the {r.answers} past answers and tells the {plural(n, "reporter")} &ldquo;Thanks — we fixed it.&rdquo;
            </span>
          )}
        </>
      )}
    </section>
  );
}
