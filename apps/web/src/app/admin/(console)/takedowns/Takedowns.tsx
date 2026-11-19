"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { DataState } from "@/components/admin/DataState";
import { Segmented } from "@/components/admin/Segmented";
import { CardHead, Chip, PageHead } from "@/components/admin/ui";
import type { Takedowns as TakedownsData } from "@/lib/admin/api";
import { shortDate } from "@/lib/admin/format";
import { useAdminData, useAdminFetch } from "@/lib/admin/session";

type TargetType = "file" | "course";
type Reason = "copyright" | "inappropriate" | "other";

const UNSHARE_AT = 5; // FR-MOD-05
const TYPES = [
  { value: "file", label: "File" },
  { value: "course", label: "Shared course" },
] as const satisfies readonly { value: TargetType; label: string }[];
const COPY: Record<TargetType, { label: string; placeholder: string; consequence: string }> = {
  file: {
    label: "SHA-256 of the file",
    placeholder: "64 characters, e.g. 9f86d081884c7d65…",
    consequence:
      "Deletes everything made from this file for every student (outlines, explanations, questions and quizzes), removes the stored copies, and refuses the file if anyone uploads it again.",
  },
  course: {
    label: "Share code",
    placeholder: "e.g. K7Q2M9XD",
    consequence: "Unshares the course at once. Every member loses access and is told it's no longer available. This can't be reversed.",
  },
};
const REASONS: { value: Reason; label: string }[] = [
  { value: "copyright", label: "Copyright request" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

const shorten = (t: string) => (t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-4)}` : t);

// 30d Takedowns (docs/reference/admin-takedowns.html): GET /admin/takedowns, POST /admin/takedowns
// and …/reverse (FR-MOD-04/05). Every takedown and reversal is logged.
export function Takedowns() {
  const { data, loading, error, reload } = useAdminData<TakedownsData>("/admin/takedowns");
  const adminFetch = useAdminFetch();
  const [type, setType] = useState<TargetType>("file");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState<Reason>("copyright");
  const [requestedBy, setRequestedBy] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = COPY[type];
  const active = data?.log.filter((t) => t.status === "active").length ?? 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone("");
    const value = target.trim();
    if (type === "file" && !/^[0-9a-fA-F]{64}$/.test(value)) {
      setConfirming(false);
      return setFormError("Paste the file's 64-character SHA-256.");
    }
    if (type === "course" && value.length < 4) {
      setConfirming(false);
      return setFormError("Add the course's share code.");
    }
    setFormError("");
    if (!confirming) return setConfirming(true);
    setBusy(true);
    try {
      const r = await adminFetch<{ students_affected: number }>("/admin/takedowns", {
        method: "POST",
        body: JSON.stringify({
          target_type: type,
          target: value,
          reason,
          requested_by: requestedBy.trim() || null,
          note: note.trim() || null,
          notify,
        }),
      });
      setDone(`Taken down. ${r.students_affected} student${r.students_affected === 1 ? "" : "s"} affected.`);
      setTarget("");
      setRequestedBy("");
      setNote("");
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function reverse(id: string) {
    try {
      await adminFetch(`/admin/takedowns/${id}/reverse`, { method: "POST" });
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <>
      <PageHead eyebrow={`${active} active · copyright and abuse removals`} title="Take" highlight="downs" />

      <form className="a-ink td-form" onSubmit={submit} noValidate aria-labelledby="td-new">
        <h2 id="td-new" className="td-form-title">
          New takedown
        </h2>
        <div className="td-col">
          <Segmented
            label="What to take down"
            raised
            options={TYPES}
            value={type}
            onChange={(t) => {
              setType(t);
              setConfirming(false);
            }}
          />
          <label className="a-field td-field">
            <span className="a-field-label">{copy.label}</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={copy.placeholder} autoComplete="off" />
          </label>
          <label className="a-field td-field">
            <span className="a-field-label">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="td-col">
          <label className="a-field td-field">
            <span className="a-field-label">Requested by</span>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Course lecturer (email on file)" maxLength={200} />
          </label>
          <label className="a-field td-field td-note">
            <span className="a-field-label">Note (internal)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Lecturer asked us to remove the MTH 201 2024 exam paper." />
          </label>
          {type === "file" && (
            <div className="td-notify">
              <button type="button" role="switch" aria-checked={notify} aria-labelledby="td-notify-label" className="td-switch" onClick={() => setNotify(!notify)} />
              <span id="td-notify-label">Notify students whose file it was</span>
            </div>
          )}
          <span className="a-muted td-small">{copy.consequence}</span>
          {formError && (
            <p className="td-error" role="alert">
              {formError}
            </p>
          )}
          {confirming && (
            <p className="td-confirm" role="alert">
              Take this {type === "file" ? "file" : "shared course"} down now?
              {type === "file" ? " You can reverse it from the log, but students will need to upload it again." : " This can't be reversed."}
            </p>
          )}
          <button type="submit" className="a-btn a-btn-danger td-go" disabled={busy}>
            <Icon name="shield" size={18} />
            {busy ? "Taking down…" : confirming ? "Yes, take it down" : "Take down"}
          </button>
          {confirming && (
            <button type="button" className="td-cancel" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          )}
          {done && (
            <p className="td-done" role="status">
              {done}
            </p>
          )}
        </div>
      </form>

      <DataState loading={loading && !data} error={error} onRetry={reload} />
      {data && (
        <>
          <section className="a-card" aria-labelledby="td-log">
            <CardHead title="Takedown log" sub="Every takedown and reversal is kept, with the admin who made it" />
            {data.log.length === 0 ? (
              <p className="a-muted">No takedowns yet.</p>
            ) : (
              <div className="a-table-wrap">
                <table className="a-table" id="td-log">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Target</th>
                      <th>Type</th>
                      <th>Reason</th>
                      <th className="a-r">Students affected</th>
                      <th>By</th>
                      <th>Status</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.log.map((t) => (
                      <tr key={t.id}>
                        <td className="a-nw">{shortDate(t.created_at)}</td>
                        <td>
                          <span className="td-mono" title={t.target}>
                            {shorten(t.target)}
                          </span>
                          {t.requested_by && <span className="td-detail">{t.requested_by}</span>}
                        </td>
                        <td className="a-nw">
                          <Chip>{t.target_type === "file" ? "File" : "Shared course"}</Chip>
                        </td>
                        <td>{REASONS.find((r) => r.value === t.reason)?.label ?? t.reason}</td>
                        <td className="a-r">{t.students_affected}</td>
                        <td className="td-mono" title={t.admin_id}>
                          #{t.admin_id.slice(0, 4).toUpperCase()}
                        </td>
                        <td className="a-nw">{t.status === "active" ? <Chip tone="success">Active</Chip> : <Chip tone="outline">Reversed</Chip>}</td>
                        <td className="a-r">
                          {t.status === "active" && t.target_type === "file" && (
                            <button type="button" className="td-reverse" aria-label={`Reverse takedown of ${t.target}`} onClick={() => reverse(t.id)}>
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="a-card" aria-labelledby="td-near">
            <CardHead title="Shared courses close to auto-unshare" sub={`Unshared automatically at ${UNSHARE_AT} reports from different members (FR-MOD-05)`} />
            {data.near_unshare.length === 0 ? (
              <p className="a-muted">No shared course has open reports.</p>
            ) : (
              <div className="a-table-wrap">
                <table className="a-table" id="td-near">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Share code</th>
                      <th className="a-r">Members</th>
                      <th className="a-c">Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.near_unshare.map((c) => (
                      <tr key={c.share_code}>
                        <td>
                          {c.code}
                          {c.title && <span className="td-detail">{c.title}</span>}
                        </td>
                        <td className="td-mono">{c.share_code}</td>
                        <td className="a-r">{c.member_count}</td>
                        <td className="a-c a-nw">
                          {c.reporters >= UNSHARE_AT - 1 ? (
                            <b>
                              {c.reporters} / {UNSHARE_AT}
                            </b>
                          ) : (
                            `${c.reporters} / ${UNSHARE_AT}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
