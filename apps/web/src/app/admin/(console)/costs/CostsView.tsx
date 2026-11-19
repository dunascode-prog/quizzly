"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { DataState } from "@/components/admin/DataState";
import { CardHead, Chip } from "@/components/admin/ui";
import { type Costs, type Overview, PROVIDER_NAME, type Range } from "@/lib/admin/api";
import { lastDays, num, pct, shortDate, usd, usd3 } from "@/lib/admin/format";
import { useAdminData } from "@/lib/admin/session";
import { RangeTiles } from "../RangeTiles";

const SPAN: Record<Range, string> = { today: "today", "7d": "7 days", "30d": "30 days" };
const FALLBACK = ["groq", "openrouter", "cloudflare"]; // order in config/models.yaml
const millions = (v: number) => `${(v / 1e6).toFixed(2)}M`;
const shortId = (id: string) => `#${id.slice(0, 4).toUpperCase()}`;

function exportCsv(rows: Costs["top_students"], range: Range) {
  // IDs, school, level, plan and usage only: no names or emails (WEB.md §3).
  const lines = [
    "student_id,school,level,plan,quiz_sets,ai_cost_usd",
    ...rows.map((s) =>
      [s.id, s.school ?? "", s.level ?? "", s.plan, s.quiz_sets, s.list_usd.toFixed(4)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    ),
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `quizzly-ai-cost-${range}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

// 30b AI costs (docs/reference/admin-ai-costs.html), from GET /admin/costs.
export function CostsView() {
  const [range, setRange] = useState<Range>("30d");
  const { data: c, loading, error, reload } = useAdminData<Costs>(`/admin/costs?range=${range}`);
  const { data: o } = useAdminData<Overview>("/admin/overview?range=today");

  const budget = o?.daily_budget_usd ?? 0;
  const daily = c ? c.daily.map((d) => d.paid_usd) : [];
  const today = daily[daily.length - 1] ?? 0;
  const days = lastDays(30);
  const chartH = 190;
  const plot = chartH - 10;
  const scale = Math.max(budget, ...daily, 0.0001);
  const taskTotal = c ? c.tasks.reduce((s, t) => s + t.list_usd, 0) : 0;
  const providers = c
    ? [...c.providers].sort((a, b) => FALLBACK.indexOf(a.provider) - FALLBACK.indexOf(b.provider))
    : [];

  return (
    <>
      <RangeTiles
        eyebrow={`AI usage · ${SPAN[range]} · Lagos time`}
        title="AI "
        highlight="costs"
        range={range}
        onRange={setRange}
        tiles={
          c
            ? [
                { label: `AI usage, ${SPAN[range]}`, value: usd(c.list_usd), note: `list price · ${usd(c.paid_usd)} paid after free tiers` },
                { label: "Per active student", value: c.active ? usd3(c.list_usd / c.active) : "—", note: `${num(c.active)} active` },
                { label: "AI calls", value: num(c.calls), note: "cached answers aren't counted" },
                { label: "Free-tier share", value: pct(c.calls ? c.free_calls / c.calls : null), note: "of calls cost $0" },
              ]
            : []
        }
      />
      <DataState loading={loading && !c} error={error} onRetry={reload} />

      {c && (
        <>
          <section className="a-ink co-daily" aria-labelledby="co-daily-title">
            <div className="co-chart">
              <div className="co-chart-head">
                <h2 id="co-daily-title" className="co-chart-title">
                  Daily AI cost paid, last 30 days
                </h2>
                {budget > 0 && <span className="a-muted co-small">Dashed line = {usd(budget)} daily budget</span>}
              </div>
              <div
                className="co-bars"
                role="img"
                aria-label={`Daily AI cost over 30 days, up to ${usd(Math.max(...daily, 0))}, today ${usd(today)}`}
                style={{ height: chartH }}
              >
                {budget > 0 && <span className="co-budget" aria-hidden="true" style={{ top: "auto", bottom: Math.round((budget / scale) * plot) }} />}
                {daily.map((v, i) => (
                  <span
                    key={days[i] ?? i}
                    title={`${days[i] ?? ""} · ${usd(v)}`}
                    className={i === daily.length - 1 ? "co-now" : undefined}
                    style={{ height: Math.max(2, Math.round((v / scale) * plot)) }}
                  />
                ))}
              </div>
              <div className="co-axis" aria-hidden="true">
                {[0, 7, 14, 21].map((i) => (
                  <span key={i}>{shortDate(`${days[i]}T12:00:00Z`)}</span>
                ))}
                <span className="co-axis-now">Today</span>
              </div>
            </div>
            <div className="co-side">
              <div className="a-raised co-stat">
                <span className="a-muted">Today</span>
                <span className="co-stat-value">{usd(o?.cost_today ?? today)}</span>
                <span className="a-muted co-tiny">
                  {budget ? `of ${usd(budget)}; new AI work pauses at the budget and queues instead of failing` : ""}
                </span>
              </div>
              <div className="a-raised co-stat">
                <span className="a-muted">Daily budget</span>
                <span className="co-stat-value">{budget ? usd(budget) : "—"}</span>
                <span className="a-muted co-tiny">Change it in Limits and plans</span>
              </div>
            </div>
          </section>

          <div className="co-providers">
            {providers.length === 0 && <p className="a-muted">No AI calls in this range.</p>}
            {providers.map((p) => {
              const open = c.health.breakers.some((b) => b.provider === p.provider && b.open);
              const name = PROVIDER_NAME[p.provider] ?? p.provider;
              const status = open ? "Paused" : p.errors ? `${num(p.errors)} errors` : "Healthy";
              return (
                <section key={p.provider} className="co-provider" aria-label={`${name}: ${status}`}>
                  <div className="co-provider-head">
                    <h2 className="co-provider-name">{name}</h2>
                    <Chip tone={open ? "danger" : p.errors ? "warning" : "success"}>{status}</Chip>
                  </div>
                  <div className="co-provider-meta">
                    <span>Fallback #{FALLBACK.indexOf(p.provider) + 1 || "—"}</span>
                    <span>p50 {p.p50_ms === null ? "—" : `${(p.p50_ms / 1000).toFixed(1)} s`}</span>
                  </div>
                  <span className="co-tiny a-muted">
                    {num(p.calls)} calls · {usd(p.paid_usd)} paid
                  </span>
                </section>
              );
            })}
          </div>

          <section className="a-card" aria-labelledby="co-tasks">
            <CardHead title="Cost by task" sub={`${SPAN[range]} · at list price`} />
            <div className="a-table-wrap">
              <table className="a-table a-nw" id="co-tasks">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Model</th>
                    <th className="a-r">Calls</th>
                    <th className="a-r">Tokens in</th>
                    <th className="a-r">Tokens out</th>
                    <th className="a-r">Cost</th>
                    <th className="a-r">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {c.tasks.map((t) => {
                    const share = taskTotal ? Math.round((t.list_usd / taskTotal) * 100) : 0;
                    return (
                      <tr key={t.task}>
                        <td>
                          <b>{t.task}</b>
                        </td>
                        <td>
                          <span className="co-model">{t.model}</span>
                        </td>
                        <td className="a-r">{num(t.calls)}</td>
                        <td className="a-r">{millions(t.tokens_in)}</td>
                        <td className="a-r">{millions(t.tokens_out)}</td>
                        <td className="a-r">{usd(t.list_usd)}</td>
                        <td className="a-r">
                          <span className="co-share">
                            <span className="co-share-bar" aria-hidden="true">
                              <span style={{ width: `${share}%` }} />
                            </span>
                            {share}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="co-total">
                    <td>Total</td>
                    <td />
                    <td className="a-r">{num(c.tasks.reduce((s, t) => s + t.calls, 0))}</td>
                    <td className="a-r">{millions(c.tasks.reduce((s, t) => s + t.tokens_in, 0))}</td>
                    <td className="a-r">{millions(c.tasks.reduce((s, t) => s + t.tokens_out, 0))}</td>
                    <td className="a-r">{usd(taskTotal)}</td>
                    <td className="a-r">{c.tasks.length ? "100%" : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="a-card" aria-labelledby="co-students">
            <CardHead
              title="Highest AI cost per student"
              sub={`${SPAN[range]} · IDs only, no names`}
              action={
                <button type="button" className="a-btn" onClick={() => exportCsv(c.top_students, range)} disabled={!c.top_students.length}>
                  <Icon name="download" size={16} />
                  Export CSV
                </button>
              }
            />
            {c.top_students.length === 0 ? (
              <p className="a-muted">No AI use by students in this range.</p>
            ) : (
              <div className="a-table-wrap">
                <table className="a-table a-nw" id="co-students">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>School</th>
                      <th>Plan</th>
                      <th className="a-r">Quiz sets</th>
                      <th className="a-r">AI cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.top_students.map((s) => (
                      <tr key={s.id}>
                        <td title={s.id}>{shortId(s.id)}</td>
                        <td>{[s.school, s.level].filter(Boolean).join(" · ") || "—"}</td>
                        <td>
                          <Chip>{s.plan}</Chip>
                        </td>
                        <td className="a-r">{num(s.quiz_sets)}</td>
                        <td className="a-r">{usd(s.list_usd)}</td>
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
