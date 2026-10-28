import type { Metadata } from "next";
import Link from "next/link";
import { CardHead, Chip, DayBars, Meter } from "@/components/admin/ui";
import { greeting, lagosDate, usd } from "@/lib/admin/format";
import { asOf, shell } from "@/lib/admin/mock";
import { overview } from "./data";
import { RangeTiles } from "./RangeTiles";
import "./overview.css";

export const metadata: Metadata = { title: "Overview" };

// 30a Overview (docs/reference/admin-overview.html). Data: GET /admin/overview, once the admin API exists.
export default function OverviewPage() {
  const { cost, providers, attention, health } = overview;
  const used = Math.round((cost.today / cost.budget) * 100);
  const openTotal = shell.openReports;

  return (
    <>
      <RangeTiles eyebrow={`${lagosDate(asOf)} · Lagos time`} title={greeting(asOf)} highlight="team" tiles={overview.tiles} />

      <section className="a-ink ov-cost" aria-labelledby="ov-cost-title">
        <div className="ov-cost-sum">
          <div className="ov-cost-top">
            <span id="ov-cost-title" className="a-kicker">
              AI cost today
            </span>
            <span className="a-num ov-cost-value">{usd(cost.today)}</span>
            <span className="a-muted">of {usd(cost.budget)} daily budget</span>
          </div>
          <div className="ov-cost-meter">
            <Meter value={used} label="Share of today's AI budget used" />
            <span className="a-muted ov-small">{used}% used · breaker trips at 100%</span>
          </div>
          <Link href="/admin/costs" className="ov-link">
            See AI costs →
          </Link>
        </div>
        <div className="ov-providers">
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
            sub={`${attention.length} newest of ${openTotal} open reports`}
            action={
              <Link href="/admin/reports" className="a-btn a-btn-ink">
                Open queue
              </Link>
            }
          />
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
                {attention.map((r) => (
                  <tr key={r.note}>
                    <td className="a-nw">
                      <Chip>{r.type}</Chip>
                    </td>
                    <td>{r.note}</td>
                    <td className="a-c a-nw">{r.reports >= 3 ? <b>{r.reports}</b> : r.reports}</td>
                    <td className="a-nw">
                      {r.hidden ? <Chip tone="warning">Auto-hidden</Chip> : <Chip tone="outline">Open</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            {health.map((h) => (
              <div key={h.label}>
                <span className="a-row-label">{h.label}</span>
                <Chip tone={h.tone}>{h.text}</Chip>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
