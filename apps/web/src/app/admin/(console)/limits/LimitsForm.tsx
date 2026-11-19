"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { CardHead, Chip } from "@/components/admin/ui";
import { admin } from "@/lib/admin/mock";
import { changes as initialChanges, features, planLimits, plans, prices, safety, worstCase, type PlanKey } from "./data";

type Limits = Record<string, Record<PlanKey, string>>;

const initialLimits = (): Limits =>
  Object.fromEntries(planLimits.map((l) => [l.key, Object.fromEntries(plans.map((p) => [p.key, String(l.values[p.key])])) as Record<PlanKey, string>]));
const initialSafety = () => Object.fromEntries(safety.map((s) => [s.key, s.value.toFixed(s.decimals ?? 0)]));
const initialFeatures = () => Object.fromEntries(features.map((f) => [f.key, f.on]));

const valid = (v: string) => /^\d+(\.\d+)?$/.test(v.trim());
const show = (s: (typeof safety)[number], v: string) => `${s.prefix ?? ""}${v}${s.suffix ?? ""}`;

// The whole page is one form: edits enable Save changes; saving logs each change locally.
// TODO(E4): PATCH /admin/config (applies within 1 minute, written to config_audit).
export function LimitsForm() {
  const [saved, setSaved] = useState(() => ({ limits: initialLimits(), safety: initialSafety(), features: initialFeatures() }));
  const [limits, setLimits] = useState(saved.limits);
  const [safe, setSafe] = useState(saved.safety);
  const [flags, setFlags] = useState(saved.features);
  const [log, setLog] = useState(initialChanges);
  const [status, setStatus] = useState("");

  const diff = useMemo(() => {
    const out: string[] = [];
    for (const l of planLimits)
      for (const p of plans)
        if (limits[l.key][p.key] !== saved.limits[l.key][p.key])
          out.push(`${p.name} · ${l.label.toLowerCase()} ${saved.limits[l.key][p.key]} → ${limits[l.key][p.key]}`);
    for (const s of safety)
      if (safe[s.key] !== saved.safety[s.key]) out.push(`${s.label} ${show(s, saved.safety[s.key])} → ${show(s, safe[s.key])}`);
    for (const f of features) if (flags[f.key] !== saved.features[f.key]) out.push(`${f.label} ${flags[f.key] ? "on" : "off"}`);
    return out;
  }, [limits, safe, flags, saved]);

  const invalid = Object.values(limits).some((r) => Object.values(r).some((v) => !valid(v))) || Object.values(safe).some((v) => !valid(v));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid || diff.length === 0) return;
    setLog((l) => [...diff.map((change) => ({ when: "Just now", who: admin.name, change })), ...l]);
    setSaved({ limits, safety: safe, features: flags });
    setStatus(`Saved ${diff.length} ${diff.length === 1 ? "change" : "changes"}. They apply within 1 minute.`);
  }

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
                <span className="a-sub">Draft numbers from the cost model. Plans and prices are not decided yet (PRD Q3); only Free is live.</span>
              </div>
              <Chip tone="warning">Student and Premium not live</Chip>
            </div>
            <div className="a-table-wrap">
              <table className="a-table lp-table">
                <thead>
                  <tr>
                    <th>Limit</th>
                    {plans.map((p) => (
                      <th key={p.key} className="a-r">
                        <span className="lp-plan">
                          <span>{p.name}</span>
                          <span className="lp-plan-note">{p.note}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planLimits.map((l) => (
                    <tr key={l.key}>
                      <th scope="row" className="lp-row-label">
                        {l.label}
                      </th>
                      {plans.map((p) => {
                        const v = limits[l.key][p.key];
                        return (
                          <td key={p.key} className="a-r">
                            <input
                              className="lp-num"
                              inputMode="numeric"
                              value={v}
                              aria-label={`${p.name}: ${l.label}`}
                              aria-invalid={!valid(v) || undefined}
                              onChange={(e) => setLimits((s) => ({ ...s, [l.key]: { ...s[l.key], [p.key]: e.target.value } }))}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="lp-muted-row">
                    <th scope="row">Worst-case AI cost per student / month</th>
                    {plans.map((p) => (
                      <td key={p.key} className="a-r">
                        {worstCase[p.key]}
                      </td>
                    ))}
                  </tr>
                  <tr className="lp-muted-row">
                    <th scope="row">Price</th>
                    {plans.map((p) => (
                      <td key={p.key} className="a-r">
                        {prices[p.key] ? <b className="lp-price">{prices[p.key]}</b> : "Not set"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="a-card" aria-labelledby="lp-log">
            <CardHead title="Recent changes" />
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
                  {log.map((c, i) => (
                    <tr key={`${c.change}-${i}`}>
                      <td className="a-nw">{c.when}</td>
                      <td>{c.who}</td>
                      <td>{c.change}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="a-stack">
          <section className="a-card" aria-labelledby="lp-safety">
            <h2 id="lp-safety" className="a-h2 lp-h2">
              Safety limits
            </h2>
            <div className="lp-rows">
              {safety.map((s) => {
                const v = safe[s.key];
                return (
                  <div key={s.key} className="lp-row">
                    <label htmlFor={`lp-${s.key}`} className="lp-row-text">
                      <span className="lp-row-title">{s.label}</span>
                      {s.note && <span className="lp-row-note">{s.note}</span>}
                    </label>
                    <label className="lp-input">
                      {s.prefix && <span aria-hidden="true">{s.prefix}</span>}
                      <input
                        id={`lp-${s.key}`}
                        inputMode="decimal"
                        size={Math.max(v.length, 1)}
                        value={v}
                        aria-invalid={!valid(v) || undefined}
                        onChange={(e) => setSafe((x) => ({ ...x, [s.key]: e.target.value }))}
                      />
                      {s.suffix && <span aria-hidden="true">{s.suffix}</span>}
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="a-card" aria-labelledby="lp-features">
            <h2 id="lp-features" className="a-h2 lp-h2">
              Features
            </h2>
            <div className="lp-rows">
              {features.map((f) => (
                <div key={f.key} className="lp-row">
                  <span className="lp-row-text" id={`lp-f-${f.key}`}>
                    <span className="lp-row-title">{f.label}</span>
                    <span className="lp-row-note">{f.note}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    className="a-switch"
                    aria-checked={flags[f.key]}
                    aria-labelledby={`lp-f-${f.key}`}
                    onClick={() => setFlags((x) => ({ ...x, [f.key]: !x[f.key] }))}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="lp-save">
        <span className="lp-save-note" role="status">
          {invalid ? "Use whole numbers (and a decimal for the budget)." : status && diff.length === 0 ? status : "Changes apply within 1 minute and are logged."}
        </span>
        <button type="submit" className="a-action lp-save-btn" disabled={invalid || diff.length === 0}>
          <span className="a-action-circle">
            <Icon name="check" size={20} strokeWidth={2.4} />
          </span>
          <span className="a-action-label">{diff.length > 1 ? `Save ${diff.length} changes` : "Save changes"}</span>
        </button>
      </div>
    </form>
  );
}
