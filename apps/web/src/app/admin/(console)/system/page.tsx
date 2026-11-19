import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { CardHead, Chip, Meter, PageHead, Tiles } from "@/components/admin/ui";
import { breakers, failures, jobs, supabase, tiles } from "./data";
import "./system.css";

export const metadata: Metadata = { title: "System" };

// 30g System health (docs/reference/admin-system.html). Data: jobs, worker_heartbeats and Supabase usage, once the admin API exists.
export default function SystemPage() {
  return (
    <>
      <PageHead
        eyebrow="Queue, worker, providers and database"
        title="System "
        highlight="health"
        action={
          // TODO(E4): re-fetch the page data.
          <button type="button" className="a-btn">
            <Icon name="refresh" size={16} />
            Refresh
          </button>
        }
      />
      <Tiles tiles={tiles} />

      <div className="a-grid-2 sy-grid">
        <div className="a-stack">
          <section className="a-card" aria-labelledby="sy-jobs">
            <CardHead title="Jobs by type (24 h)" />
            <div className="a-table-wrap">
              <table className="a-table a-nw" id="sy-jobs">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th className="a-r">Done</th>
                    <th className="a-r">Failed</th>
                    <th className="a-r">p50</th>
                    <th className="a-r">p95</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.job}>
                      <td>{j.job}</td>
                      <td className="a-r">{j.done}</td>
                      <td className="a-r">{j.failed}</td>
                      <td className="a-r">{j.p50}</td>
                      <td className="a-r">{j.p95}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="a-card" aria-labelledby="sy-fail">
            <CardHead title="Recent failures" sub="Permanent reasons fail at once; transient ones retry with backoff (FR-SEC-03/06)" />
            <div className="a-table-wrap">
              <table className="a-table" id="sy-fail">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Job</th>
                    <th>Reason</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f) => (
                    <tr key={f.id}>
                      <td className="a-nw">{f.when}</td>
                      <td className="a-nw">
                        {f.job}
                        {f.attempt && <span className="sy-note">{f.attempt}</span>}
                      </td>
                      <td>
                        <Chip tone={f.tone} icon={f.tone === "danger" ? "close" : undefined}>
                          {f.reason}
                        </Chip>
                      </td>
                      <td className="a-r">
                        {f.permanent && (
                          // TODO(E4): open the failed job (document, error, attempts).
                          <button type="button" className="a-btn sy-open" aria-label={`Open ${f.job} failure from ${f.when}`}>
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="a-stack">
          <section className="a-card" aria-label="Supabase usage">
            <CardHead title={`Supabase (${supabase.plan})`} sub={supabase.period} />
            <div className="sy-usage">
              {supabase.usage.map((u) => {
                const text = `${u.used} of ${u.limit}${u.unit ? ` ${u.unit}` : ""}`;
                return (
                  <div key={u.label} className="sy-use">
                    <div className="sy-use-head">
                      <b>{u.label}</b>
                      <span className="a-muted">{text}</span>
                    </div>
                    <Meter value={u.used} max={u.limit} light label={`${u.label}: ${text}`} />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="a-card" aria-labelledby="sy-ai">
            <CardHead title="AI providers" />
            <div className="a-table-wrap">
              <table className="a-table" id="sy-ai">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Breaker</th>
                    <th className="a-r">p50</th>
                  </tr>
                </thead>
                <tbody>
                  {breakers.map((b) => (
                    <tr key={b.name}>
                      <td>
                        {b.name}
                        {b.note && <span className="sy-note">{b.note}</span>}
                      </td>
                      <td>
                        <Chip tone={b.tone}>{b.state}</Chip>
                      </td>
                      <td className="a-r a-nw">{b.p50}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
