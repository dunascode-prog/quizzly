"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/admin/Segmented";
import { CardHead, Chip } from "@/components/admin/ui";
import { admin } from "@/lib/admin/mock";
import { type Takedown, type TargetType, targetCopy, targetTypes } from "./data";

const shorten = (t: string) => (t.length > 14 && !t.startsWith("/") ? `${t.slice(0, 4)}…${t.slice(-3)}` : t);

// New-takedown form and the log. Both change local state only. TODO(E4): POST /admin/takedowns and /admin/takedowns/{id}/reverse.
export function Takedowns({ log: initial, today }: { log: Takedown[]; today: string }) {
  const [log, setLog] = useState(initial);
  const [type, setType] = useState<TargetType>("File");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const copy = targetCopy[type];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone("");
    if (!target.trim() || !reason.trim()) {
      setConfirming(false);
      return setError(`Add the ${copy.label.toLowerCase()} and a reason.`);
    }
    setError("");
    if (!confirming) return setConfirming(true);
    setLog((l) => [
      {
        id: `new-${l.length}`,
        date: today,
        target: shorten(target.trim()),
        detail: note.trim() || requestedBy.trim() || "Added just now",
        type,
        reason: reason.trim(),
        affected: null,
        by: admin.name,
        active: true,
      },
      ...l,
    ]);
    setDone(`Taken down. ${notify ? "Affected students will get a notification." : "Students won't be notified."}`);
    setTarget("");
    setReason("");
    setRequestedBy("");
    setNote("");
    setConfirming(false);
  }

  return (
    <>
      <form className="a-ink td-form" onSubmit={submit} noValidate aria-labelledby="td-new">
        <h2 id="td-new" className="td-form-title">
          New takedown
        </h2>
        <div className="td-col">
          <Segmented
            label="What to take down"
            raised
            options={targetTypes}
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
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Copyright request" />
          </label>
        </div>
        <div className="td-col">
          <label className="a-field td-field">
            <span className="a-field-label">Requested by</span>
            <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} placeholder="Course lecturer (email on file)" />
          </label>
          <label className="a-field td-field td-note">
            <span className="a-field-label">Note (internal)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Lecturer asked us to remove the MTH 201 2024 exam paper." />
          </label>
          <div className="td-notify">
            <button type="button" role="switch" aria-checked={notify} aria-labelledby="td-notify-label" className="td-switch" onClick={() => setNotify(!notify)} />
            <span id="td-notify-label">Notify affected students</span>
          </div>
          <span className="a-muted td-small">{copy.consequence}</span>
          {error && (
            <p className="td-error" role="alert">
              {error}
            </p>
          )}
          {confirming && (
            <p className="td-confirm" role="alert">
              Take this {type.toLowerCase()} down now? You can reverse it from the log.
            </p>
          )}
          <button type="submit" className="a-btn a-btn-danger td-go">
            <Icon name="shield" size={18} />
            {confirming ? "Yes, take it down" : "Take down"}
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

      <section className="a-card" aria-labelledby="td-log">
        <CardHead title="Takedown log" sub="Every takedown and reversal is kept for 2 years" />
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
              {log.map((t) => (
                <tr key={t.id}>
                  <td className="a-nw">{t.date}</td>
                  <td>
                    <span className="td-mono">{t.target}</span>
                    <span className="td-detail">{t.detail}</span>
                  </td>
                  <td className="a-nw">
                    <Chip>{t.type}</Chip>
                  </td>
                  <td>{t.reason}</td>
                  <td className="a-r">{t.affected ?? "—"}</td>
                  <td>{t.by}</td>
                  <td className="a-nw">{t.active ? <Chip tone="success">Active</Chip> : <Chip tone="outline">Reversed</Chip>}</td>
                  <td className="a-r">
                    {t.active && (
                      <button
                        type="button"
                        className="td-reverse"
                        aria-label={`Reverse takedown of ${t.target}`}
                        onClick={() => setLog((l) => l.map((x) => (x.id === t.id ? { ...x, active: false } : x)))}
                      >
                        Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
