import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { CardHead, Chip, Meter } from "@/components/admin/ui";
import { usd } from "@/lib/admin/format";
import { RangeTiles } from "../RangeTiles";
import { alertAt, breaker, daily, dailyAxis, dailyBudget, eyebrow, providers, tasks, tiles, topStudents } from "./data";
import "./costs.css";

export const metadata: Metadata = { title: "AI costs" };

const num = (v: number) => v.toLocaleString("en-GB");
const millions = (v: number) => `${v.toFixed(2)}M`;

// 30b AI costs (docs/reference/admin-ai-costs.html). Data: llm_calls aggregates and provider_limits, once the admin API exists.
export default function CostsPage() {
  const total = tasks.reduce((s, t) => s + t.cost, 0);
  const sum = (k: "calls" | "tokensIn" | "tokensOut") => tasks.reduce((s, t) => s + t[k], 0);
  const today = daily[daily.length - 1];
  const chartH = 190;
  const plot = chartH - 10; // the budget line sits 10px below the top

  return (
    <>
      <RangeTiles eyebrow={eyebrow} title="AI " highlight="costs" tiles={tiles} initial="30d" />

      <section className="a-ink co-daily" aria-labelledby="co-daily-title">
        <div className="co-chart">
          <div className="co-chart-head">
            <h2 id="co-daily-title" className="co-chart-title">
              Daily AI cost, last 30 days
            </h2>
            <span className="a-muted co-small">Dashed line = {usd(dailyBudget)} daily budget</span>
          </div>
          <div
            className="co-bars"
            role="img"
            aria-label={`Daily AI cost over 30 days, between ${usd(Math.min(...daily))} and ${usd(Math.max(...daily))}, today ${usd(today)}`}
            style={{ height: chartH }}
          >
            <span className="co-budget" aria-hidden="true" />
            {daily.map((v, i) => (
              <span
                key={i}
                title={usd(v)}
                className={i === daily.length - 1 ? "co-now" : undefined}
                style={{ height: Math.round((v / dailyBudget) * plot) }}
              />
            ))}
          </div>
          <div className="co-axis" aria-hidden="true">
            {dailyAxis.map((d) => (
              <span key={d}>{d}</span>
            ))}
            <span className="co-axis-now">Today</span>
          </div>
        </div>
        <div className="co-side">
          <div className="a-raised co-stat">
            <span className="a-muted">Circuit breaker</span>
            <span className="co-stat-value">{breaker}</span>
            <span className="a-muted co-tiny">Opens at {usd(dailyBudget)}/day; work queues instead of failing</span>
          </div>
          <div className="a-raised co-stat">
            <span className="a-muted">Alert email</span>
            <span className="co-stat-value">at {alertAt}%</span>
            <span className="a-muted co-tiny">Change in Limits and plans</span>
          </div>
        </div>
      </section>

      <div className="co-providers">
        {providers.map((p) => (
          <section key={p.name} className="co-provider" aria-label={`${p.name}: ${p.status}`}>
            <div className="co-provider-head">
              <h2 className="co-provider-name">{p.name}</h2>
              <Chip tone={p.tone}>{p.status}</Chip>
            </div>
            <div className="co-provider-meta">
              <span>Fallback #{p.fallback}</span>
              <span>p50 {p.p50}</span>
            </div>
            <div className="co-provider-use">
              <Meter value={p.freeUsed} light label={`${p.name} free-tier requests used today`} />
              <span className="co-tiny a-muted">Free-tier requests used today: {p.freeUsed}%</span>
            </div>
            <span className="co-tiny a-muted">{p.note}</span>
          </section>
        ))}
      </div>

      <section className="a-card" aria-labelledby="co-tasks">
        <CardHead title="Cost by task" sub="Last 30 days · from llm_calls" />
        <div className="a-table-wrap">
          <table className="a-table a-nw" id="co-tasks">
            <thead>
              <tr>
                <th>Task</th>
                <th>Model</th>
                <th className="a-r">Calls</th>
                <th className="a-r">Tokens in</th>
                <th className="a-r">Tokens out</th>
                <th className="a-r">Served from cache</th>
                <th className="a-r">Cost</th>
                <th className="a-r">Share</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const share = t.share;
                return (
                  <tr key={t.task}>
                    <td>
                      <b>{t.task}</b>
                    </td>
                    <td>
                      <span className="co-model">{t.model}</span>
                    </td>
                    <td className="a-r">{num(t.calls)}</td>
                    <td className="a-r">{millions(t.tokensIn)}</td>
                    <td className="a-r">{millions(t.tokensOut)}</td>
                    <td className="a-r">{t.cached === null ? <span aria-label="not cached">—</span> : `${t.cached}%`}</td>
                    <td className="a-r">{usd(t.cost)}</td>
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
                <td className="a-r">{num(sum("calls"))}</td>
                <td className="a-r">{millions(sum("tokensIn"))}</td>
                <td className="a-r">{millions(sum("tokensOut"))}</td>
                <td />
                <td className="a-r">{usd(total)}</td>
                <td className="a-r">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="a-card" aria-labelledby="co-students">
        <CardHead
          title="Highest AI cost per student"
          sub="Last 30 days · IDs only, no names"
          action={
            // TODO(E4): CSV export of this table (IDs only, no names or emails).
            <button type="button" className="a-btn">
              <Icon name="download" size={16} />
              Export CSV
            </button>
          }
        />
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
              {topStudents.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.school}</td>
                  <td>
                    <Chip>{s.plan}</Chip>
                  </td>
                  <td className="a-r">{s.quizSets}</td>
                  <td className="a-r">{usd(s.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
