"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { DataState } from "@/components/admin/DataState";
import { Chip, PageHead } from "@/components/admin/ui";
import { type ReportDetail, type ReportGroup, type ReportTarget, TYPE_LABEL } from "@/lib/admin/api";
import { shortDate, time } from "@/lib/admin/format";
import { useAdminData, useAdminFetch } from "@/lib/admin/session";

type Filter = "all" | ReportTarget | "hidden";
type Status = "open" | "resolved" | "dismissed";

const letter = (i: number) => String.fromCharCode(65 + i);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const when = (iso: string) => `${shortDate(iso)}, ${time(iso)}`;
const REASON: Record<string, string> = {
  wrong: "Wrong",
  unclear: "Unclear",
  inappropriate: "Inappropriate",
  copyright: "Copyright",
  spam: "Spam",
  other: "Other",
};

// 30c Reports queue (docs/reference/admin-reports.html): GET /admin/reports, the detail of the selected
// item, and its actions (dismiss, keep hidden, fix answer). Every view and action is logged.
export function ReportsQueue() {
  const [status, setStatus] = useState<Status>("open");
  const queue = useAdminData<ReportGroup[]>(`/admin/reports?status=${status}&limit=200`);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const reports = useMemo(() => queue.data ?? [], [queue.data]);
  const count = (f: Filter) =>
    f === "all" ? reports.length : f === "hidden" ? reports.filter((r) => r.hidden).length : reports.filter((r) => r.type === f).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      if (filter === "hidden" ? !r.hidden : filter !== "all" && r.type !== filter) return false;
      return !q || [r.target_id, r.note ?? "", r.preview].some((t) => t.toLowerCase().includes(q));
    });
  }, [reports, filter, query]);
  const key = (r: ReportGroup) => `${r.type}:${r.target_id}`;
  const selected = visible.find((r) => key(r) === selectedKey) ?? visible[0];
  const oldest = reports.length ? reports[reports.length - 1].last_at : null;

  return (
    <>
      <PageHead
        eyebrow={
          status === "open"
            ? `${reports.length} open · ${count("hidden")} auto-hidden${oldest ? ` · oldest ${shortDate(oldest)}` : ""}`
            : `${reports.length} ${status}`
        }
        title="Reports "
        highlight="queue"
        action={
          <div className="a-filters" role="group" aria-label="Report status">
            {(["open", "resolved", "dismissed"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        }
      />
      <div className="a-filters" role="group" aria-label="Filter reports">
        {(["all", "question", "explanation", "chat_message", "hidden", "course"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "hidden" ? "Auto-hidden" : `${TYPE_LABEL[f]}s`} {count(f)}
          </button>
        ))}
      </div>
      <DataState loading={queue.loading && !queue.data} error={queue.error} onRetry={queue.reload} />

      <div className="rp-layout">
        <div className="rp-list">
          <label className="a-search rp-search">
            <Icon name="search" size={18} />
            <span className="sr-only">Search reports</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes, question, course, ID" />
          </label>
          {queue.data && visible.length === 0 && <p className="rp-empty">Nothing here right now.</p>}
          {visible.map((r) => (
            <button key={key(r)} type="button" className="rp-item" aria-pressed={selected && key(selected) === key(r)} onClick={() => setSelectedKey(key(r))}>
              <span className="rp-item-tags">
                <span className="a-chip rp-kind">{TYPE_LABEL[r.type]}</span>
                {status !== "open" ? (
                  <Chip tone="outline">{status}</Chip>
                ) : r.hidden ? (
                  <Chip tone="warning">Auto-hidden</Chip>
                ) : (
                  <Chip tone="outline">Open</Chip>
                )}
              </span>
              <span className="rp-item-title">
                {REASON[r.reason] ?? r.reason} · {plural(r.reports, "report")}
              </span>
              <span className="rp-item-note">
                {r.note ?? r.preview ?? "No note"} · {shortDate(r.last_at)}
              </span>
            </button>
          ))}
        </div>

        {selected ? (
          <Detail key={key(selected)} group={selected} open={status === "open"} onDone={queue.reload} />
        ) : (
          <section className="a-card rp-detail rp-empty">Choose a report to see it here.</section>
        )}
      </div>
    </>
  );
}

type Question = {
  type: string;
  stem: string;
  options: string[] | null;
  answer: unknown;
  explanation: string;
  source_pages: number[];
  hidden: boolean;
  source_text: string | null;
  answered: number;
  correct: number;
};

function Detail({ group, open, onDone }: { group: ReportGroup; open: boolean; onDone: () => void }) {
  const path = `/admin/reports/${group.type}/${group.target_id}`;
  const { data, loading, error, reload } = useAdminData<ReportDetail>(path);
  const adminFetch = useAdminFetch();
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<string>("");

  async function act(action: string, body: unknown, done: (r: Record<string, number>) => string) {
    setBusy(true);
    setActionError(null);
    try {
      const result = await adminFetch<Record<string, number>>(action, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      setMessage(done(result));
      onDone();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section className="a-card rp-detail">
        <DataState loading={loading} error={error} onRetry={reload} />
      </section>
    );
  }

  const q = group.type === "question" ? (data.item as Question | null) : null;
  const other = group.type !== "question" ? (data.item as Record<string, unknown> | null) : null;
  const n = data.reporters.length;
  const fixable = q && ["mcq", "true_false", "fill_blank"].includes(q.type);
  const stored = q ? (typeof q.answer === "object" && q.answer !== null ? (q.answer as { text?: string }).text : q.answer) : null;
  const fixValue = (): number | boolean | string | null => {
    if (!q || fix === "") return null;
    if (q.type === "mcq") return Number(fix);
    if (q.type === "true_false") return fix === "true";
    return fix;
  };

  return (
    <section className="a-card rp-detail" aria-labelledby="rp-title">
      <div className="rp-tags">
        <span className="a-chip">{q ? `Question · ${q.type.replace("_", " ")}` : TYPE_LABEL[group.type]}</span>
        {group.hidden && <Chip tone="warning">Auto-hidden from new quizzes</Chip>}
      </div>

      {!data.item && <p className="a-muted">The reported item was deleted.</p>}
      {q && (
        <>
          <h2 id="rp-title" className="rp-title">
            {q.stem}
          </h2>
          <span className="a-sub">
            Answered {q.answered} times · {q.answered ? Math.round((q.correct / q.answered) * 100) : 0}% right · pages {q.source_pages.join(", ")}
          </span>
          {q.options ? (
            <ol className="rp-options" aria-label="Options">
              {q.options.map((o, i) => (
                <li key={i} className={`rp-option${stored === i ? " rp-bad" : ""}`}>
                  <span className="rp-letter" aria-hidden="true">
                    {letter(i)}
                  </span>
                  <span className="sr-only">{letter(i)}.</span>
                  <span className="rp-option-text">{o}</span>
                  {stored === i && <span className="rp-option-tag">Stored answer</span>}
                </li>
              ))}
            </ol>
          ) : (
            <blockquote className="rp-text">Stored answer: {String(stored)}</blockquote>
          )}
          {q.source_text && (
            <div className="a-ink rp-source">
              <span className="a-kicker">What the notes say · p. {q.source_pages.join(", ")}</span>
              <p>&ldquo;{q.source_text}&rdquo;</p>
            </div>
          )}
        </>
      )}
      {other && (
        <>
          <h2 id="rp-title" className="rp-title">
            {String(other.title ?? other.code ?? `${REASON[group.reason] ?? group.reason} ${TYPE_LABEL[group.type].toLowerCase()}`)}
          </h2>
          {"content" in other && <blockquote className="rp-text">{String(other.content ?? "")}</blockquote>}
          {"share_status" in other && (
            <span className="a-sub">
              Share {String(other.share_code ?? "—")} · {String(other.share_status ?? "not shared")} · {String(other.member_count ?? 0)} members.
              Take it down from Takedowns.
            </span>
          )}
        </>
      )}

      <div className="rp-reporters">
        <h3 className="rp-h3">
          {plural(n, "report")} from {plural(n, "student")}
        </h3>
        <ol>
          {data.reporters.map((p, i) => (
            <li key={i}>
              <span className="rp-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="rp-rep">
                <span>{p.note ?? `${REASON[p.reason] ?? p.reason}, no note`}</span>
                <span className="rp-small a-muted">
                  {[p.school, p.level].filter(Boolean).join(" ") || "A student"} · {when(p.created_at)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {actionError && (
        <p className="a-error" role="alert">
          {actionError}
        </p>
      )}
      {message ? (
        <p className="rp-done" role="status">
          <Icon name="check" size={16} strokeWidth={2.6} />
          {message}
        </p>
      ) : open ? (
        <>
          {fixable && q && (
            <div className="rp-actions">
              <label className="a-field rp-fix">
                <span className="a-field-label">Correct answer</span>
                {q.type === "mcq" && q.options ? (
                  <select value={fix} onChange={(e) => setFix(e.target.value)}>
                    <option value="">Choose…</option>
                    {q.options.map((o, i) => (
                      <option key={i} value={i} disabled={stored === i}>
                        {letter(i)}. {o}
                      </option>
                    ))}
                  </select>
                ) : q.type === "true_false" ? (
                  <select value={fix} onChange={(e) => setFix(e.target.value)}>
                    <option value="">Choose…</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input value={fix} onChange={(e) => setFix(e.target.value)} maxLength={200} />
                )}
              </label>
              <button
                type="button"
                className="a-btn a-btn-ink"
                disabled={busy || fixValue() === null}
                onClick={() =>
                  act(`/admin/reports/question/${group.target_id}/fix-answer`, { answer: fixValue() }, (r) =>
                    `Answer fixed. ${r.remarked} past answers re-marked, ${r.rescored} quizzes rescored and ${plural(r.thanked, "reporter")} thanked.`,
                  )
                }
              >
                <Icon name="check" size={16} />
                Fix answer
              </button>
            </div>
          )}
          <div className="rp-actions">
            {group.type === "question" && (
              <button
                type="button"
                className="a-btn a-btn-ghost"
                disabled={busy}
                onClick={() => act(`${path}/keep-hidden`, null, () => "Kept hidden. Students won't see it in quizzes again.")}
              >
                <Icon name="eyeOff" size={16} />
                Keep hidden
              </button>
            )}
          </div>
          <button
            type="button"
            className="rp-dismiss"
            disabled={busy}
            onClick={() => act(`${path}/dismiss`, null, () => (group.hidden ? "Dismissed and restored to quizzes." : "Dismissed."))}
          >
            {group.hidden ? "Dismiss and restore" : "Dismiss"}
          </button>
          {fixable && (
            <span className="a-sub rp-small">
              Fixing the answer re-marks every past answer to this question, rescores those quizzes and thanks the {plural(n, "reporter")}.
            </span>
          )}
        </>
      ) : null}
    </section>
  );
}
