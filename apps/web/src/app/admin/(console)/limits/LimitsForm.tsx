"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { DataState } from "@/components/admin/DataState";
import { CardHead } from "@/components/admin/ui";
import type { LimitField, Limits } from "@/lib/admin/api";
import { shortDate, time } from "@/lib/admin/format";
import { useAdminData, useAdminFetch } from "@/lib/admin/session";

const PLANS = ["Free", "Student", "Premium"] as const;
const PRICE: Record<(typeof PLANS)[number], string> = { Free: "$0", Student: "$6 / month", Premium: "$10 / month" };
const show = (f: LimitField, v: number | string) => (f.unit === "USD" ? `$${v}` : f.unit ? `${v} ${f.unit}` : `${v}`);
const text = (f: LimitField, v: number) => (f.decimals ? v.toFixed(2) : String(v));

/** Which plan column a field belongs to, and the row it sits on. */
function cell(f: LimitField): { plan: (typeof PLANS)[number]; row: string } | null {
  const daily = /^(Free|Student|Premium) plan, a day$/.exec(f.group);
  if (daily) return { plan: daily[1] as (typeof PLANS)[number], row: `${f.label} a day` };
  if (f.group === "Storage per student" || f.group === "Monthly AI allowance") {
    return { plan: f.label as (typeof PLANS)[number], row: f.group === "Storage per student" ? "Storage (MB)" : "Monthly AI allowance (USD)" };
  }
  return null;
}

// 30e Limits and plans (docs/reference/admin-limits-plans.html): GET and PUT /admin/limits. The page is
// one form; saving applies to every student within a minute and logs each change with its old value.
export function LimitsForm() {
  const { data, loading, error, reload } = useAdminData<Limits>("/admin/limits");
  const adminFetch = useAdminFetch();
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.fields.map((f) => [f.key, text(f, f.value)])));
  }, [data]);

  const fields = useMemo(() => data?.fields ?? [], [data]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const rows = useMemo(() => {
    const out = new Map<string, Partial<Record<(typeof PLANS)[number], LimitField>>>();
    for (const f of fields) {
      const c = cell(f);
      if (c) out.set(c.row, { ...out.get(c.row), [c.plan]: f });
    }
    return [...out.entries()];
  }, [fields]);
  const safety = fields.filter((f) => !cell(f));

  const valid = (f: LimitField, v: string) => {
    if (!/^\d+(\.\d+)?$/.test(v.trim())) return false;
    const n = Number(v);
    return (f.decimals || Number.isInteger(n)) && n >= f.min && n <= f.max;
  };
  const changed = fields.filter((f) => values[f.key] !== undefined && Number(values[f.key]) !== f.value);
  const invalid = fields.filter((f) => values[f.key] !== undefined && !valid(f, values[f.key]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid.length || !changed.length) return;
    setBusy(true);
    setSaveError("");
    try {
      // Back at the default: clear the override instead of storing the same number.
      const body = Object.fromEntries(changed.map((f) => [f.key, Number(values[f.key]) === f.default ? null : Number(values[f.key])]));
      await adminFetch("/admin/limits", { method: "PUT", body: JSON.stringify({ values: body }) });
      setStatus(`Saved ${changed.length} ${changed.length === 1 ? "change" : "changes"}. Every student gets them within ${data?.applies_within_s ?? 60} seconds.`);
      reload();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function input(f: LimitField, label: string) {
    const v = values[f.key] ?? "";
    return (
      <span className="lp-cell">
        <input
          className="lp-num"
          inputMode={f.decimals ? "decimal" : "numeric"}
          value={v}
          aria-label={label}
          aria-invalid={!valid(f, v) || undefined}
          title={`${f.min}–${f.max}${f.unit ? ` ${f.unit}` : ""} · default ${show(f, text(f, f.default))}`}
          onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
        />
        {Number(v) !== f.default && (
          <button
            type="button"
            className="lp-reset"
            aria-label={`Back to the default for ${label}: ${show(f, text(f, f.default))}`}
            title={`Default ${show(f, text(f, f.default))}`}
            onClick={() => setValues((s) => ({ ...s, [f.key]: text(f, f.default) }))}
          >
            <Icon name="refresh" size={14} />
          </button>
        )}
      </span>
    );
  }

  if (!data) return <DataState loading={loading} error={error} onRetry={reload} />;

  return (
    <form className="lp-form" onSubmit={save} noValidate>
      <div className="lp-grid">
        <div className="a-stack">
          <section className="a-card" aria-labelledby="lp-plans">
            <div className="lp-plan-head">
              <div className="a-card-title">
                <h2 id="lp-plans" className="a-h2">
                  Plan limits
                </h2>
                <span className="a-sub">Per student. The arrow next to a changed value puts its default back.</span>
              </div>
            </div>
            <div className="a-table-wrap">
              <table className="a-table lp-table">
                <thead>
                  <tr>
                    <th>Limit</th>
                    {PLANS.map((p) => (
                      <th key={p} className="a-r">
                        <span className="lp-plan">
                          <span>{p}</span>
                          <span className="lp-plan-note">{PRICE[p]}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([row, plans]) => (
                    <tr key={row}>
                      <th scope="row" className="lp-row-label">
                        {row}
                      </th>
                      {PLANS.map((p) => (
                        <td key={p} className="a-r">
                          {plans[p] ? input(plans[p]!, `${p}: ${row}`) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="a-card" aria-labelledby="lp-log">
            <CardHead title="Recent changes" sub="Every change, with who made it and the value before" />
            {data.changes.length === 0 ? (
              <p className="a-muted">No changes yet: every limit is at its default.</p>
            ) : (
              <div className="a-table-wrap">
                <table className="a-table" id="lp-log">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.changes.map((c, i) => {
                      const f = c.key ? byKey.get(c.key) : undefined;
                      const name = f ? `${f.group.replace(", a day", "")} · ${f.label}` : (c.key ?? "Limit");
                      const to = c.new === null ? "default" : f ? show(f, String(c.new)) : String(c.new);
                      return (
                        <tr key={`${c.created_at}-${i}`}>
                          <td className="a-nw">
                            {shortDate(c.created_at)}, {time(c.created_at)}
                          </td>
                          <td className="td-mono" title={c.admin_id}>
                            #{c.admin_id.slice(0, 4).toUpperCase()}
                          </td>
                          <td>
                            {name}: {f ? show(f, String(c.old)) : String(c.old)} → {to}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="a-stack">
          <section className="a-card" aria-labelledby="lp-safety">
            <h2 id="lp-safety" className="a-h2 lp-h2">
              Safety limits
            </h2>
            <div className="lp-rows">
              {safety.map((f) => (
                <div key={f.key} className="lp-row">
                  <span className="lp-row-text">
                    <span className="lp-row-title">{f.label}</span>
                    <span className="lp-row-note">
                      {f.min}–{f.max}
                      {f.unit ? ` ${f.unit}` : ""} · default {show(f, text(f, f.default))}
                    </span>
                  </span>
                  {input(f, f.label)}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="lp-save">
        <span className="lp-save-note" role="status">
          {saveError ||
            (invalid.length
              ? `Check ${invalid.map((f) => f.label).join(", ")}: whole numbers within their range (decimals for money).`
              : status && !changed.length
                ? status
                : `Changes apply to every student within ${data.applies_within_s} seconds and are logged.`)}
        </span>
        <button type="submit" className="a-action lp-save-btn" disabled={busy || invalid.length > 0 || changed.length === 0}>
          <span className="a-action-circle">
            <Icon name="check" size={20} strokeWidth={2.4} />
          </span>
          <span className="a-action-label">{busy ? "Saving…" : changed.length > 1 ? `Save ${changed.length} changes` : "Save changes"}</span>
        </button>
      </div>
    </form>
  );
}
