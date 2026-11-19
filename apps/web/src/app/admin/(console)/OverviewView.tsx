"use client";

import Link from "next/link";
import { useState } from "react";
import { DataState } from "@/components/admin/DataState";
import { CardHead, Chip, DayBars, Meter, type TileData } from "@/components/admin/ui";
import { type Overview, PROVIDER_NAME, type Range, TYPE_LABEL } from "@/lib/admin/api";
import { dayBars, greeting, healthRows, lagosDate, num, usd } from "@/lib/admin/format";
import { useAdminData } from "@/lib/admin/session";
import { RangeTiles } from "./RangeTiles";

const SPAN: Record<Range, string> = { today: "today", "7d": "in 7 days", "30d": "in 30 days" };

function tiles(o: Overview, range: Range): TileData[] {
  return [
    { label: `Active students ${SPAN[range]}`, value: num(o.active), note: `${num(o.active_month)} in 30 days` },
    { label: `New sign-ups ${SPAN[range]}`, value: num(o.signups), note: `${num(o.invited)} from invite links` },
    { label: `Documents processed ${SPAN[range]}`, value: num(o.documents), note: `${num(o.duplicates)} were duplicates (free)` },
    { label: "Open reports", value: num(o.open_reports), note: `${num(o.auto_hidden)} auto-hidden` },
  ];
}

// 30a Overview (docs/reference/admin-overview.html), from GET /admin/overview.
export function OverviewView() {
  const [range, setRange] = useState<Range>("today");
  const { data: o, loading, error, reload } = useAdminData<Overview>(`/admin/overview?range=${range}`);
  const now = new Date().toISOString();

  const used = o ? Math.round((o.cost_today / o.daily_budget_usd) * 100) : 0;
  const providers = o
    ? [...new Set(o.providers.map((p) => p.provider))].map((name) => ({
        name: PROVIDER_NAME[name] ?? name,
        week: dayBars(o.providers.filter((p) => p.provider === name).map((p) => ({ day: p.day, value: p.cost }))),
      }))
    : [];

  return (
    <>
      <RangeTiles
        eyebrow={`${lagosDate(now)} · Lagos time`}
        title={greeting(now)}
        highlight="team"
        tiles={o ? tiles(o, range) : []}
        range={range}
        onRange={setRange}
      />
      <DataState loading={loading && !o} error={error} onRetry={reload} />

      {o && (
        <>
          <section className="a-ink ov-cost" aria-labelledby="ov-cost-title">
            <div className="ov-cost-sum">
              <div className="ov-cost-top">
                <span id="ov-cost-title" className="a-kicker">
                  AI cost today
                </span>
                <span className="a-num ov-cost-value">{usd(o.cost_today)}</span>
                <span className="a-muted">of {usd(o.daily_budget_usd)} daily budget</span>
              </div>
              <div className="ov-cost-meter">
                <Meter value={used} label="Share of today's AI budget used" />
                <span className="a-muted ov-small">{used}% used · new AI work pauses at 100%</span>
              </div>
              <Link href="/admin/costs" className="ov-link">
                See AI costs →
              </Link>
            </div>
            <div className="ov-providers">
              {providers.length === 0 && <p className="a-muted">No AI calls in the last 7 days.</p>}
              {providers.map((p) => {
                const today = p.week[p.week.length - 1].value;
                const total = p.week.reduce((s, d) => s + d.value, 0);
                return (
                  <div key={p.name} className="a-raised ov-provider">
                    <div className="ov-provider-head">
                      <span className="ov-provider-name">{p.name}</span>
                      <span className="a-muted ov-small">7 days {usd(total)}</span>
                    </div>
                    <DayBars points={p.week} label={`${p.name} daily cost, today ${usd(today)}`} format={usd} />
                  </div>
                );
              })}
            </div>
          </section>

          <div className="a-grid-2">
            <section className="a-card" aria-labelledby="ov-attn">
              <CardHead
                title="Needs your attention"
                sub={`${o.attention.length} newest of ${o.open_reports} open reports`}
                action={
                  <Link href="/admin/reports" className="a-btn a-btn-ink">
                    Open queue
                  </Link>
                }
              />
              {o.attention.length === 0 ? (
                <p className="a-muted">No open reports.</p>
              ) : (
                <div className="a-table-wrap">
                  <table className="a-table" id="ov-attn">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Note</th>
                        <th className="a-c">Reports</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.attention.map((r) => (
                        <tr key={`${r.type}:${r.target_id}`}>
                          <td className="a-nw">
                            <Chip>{TYPE_LABEL[r.type as keyof typeof TYPE_LABEL] ?? r.type}</Chip>
                          </td>
                          <td>{r.note ?? <span className="a-muted">({r.reason}, no note)</span>}</td>
                          <td className="a-c a-nw">{r.reports >= 3 ? <b>{r.reports}</b> : r.reports}</td>
                          <td className="a-nw">
                            {r.hidden ? <Chip tone="warning">Auto-hidden</Chip> : <Chip tone="outline">Open</Chip>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="a-card" aria-label="System health">
              <CardHead
                title="System health"
                sub="Live"
                action={
                  <Link href="/admin/system" className="a-btn">
                    Details
                  </Link>
                }
              />
              <div className="a-rows">
                {healthRows(o.health).map((h) => (
                  <div key={h.label}>
                    <span className="a-row-label">{h.label}</span>
                    <Chip tone={h.tone}>{h.text}</Chip>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
