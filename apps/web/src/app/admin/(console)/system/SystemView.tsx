"use client";

import { Icon } from "@/components/Icon";
import { DataState } from "@/components/admin/DataState";
import { CardHead, Chip, PageHead, Tiles, type TileData } from "@/components/admin/ui";
import { PROVIDER_NAME, type System } from "@/lib/admin/api";
import { ago, duration, num, shortDate, time } from "@/lib/admin/format";
import { useAdminData } from "@/lib/admin/session";

// Our own failure reasons that won't succeed on a retry (FR-SEC-06); anything else retried first.
const PERMANENT = ["encrypted", "corrupt", "no_text", "too_large", "blocked", "crashed"];

function tiles(s: System): TileData[] {
  const beat = s.health.worker_beat_s;
  return [
    { label: "Jobs waiting", value: num(s.health.waiting), note: `${num(s.health.running)} running now`, ink: true },
    { label: "Failed in 24 h", value: num(s.health.failed_24h) },
    {
      label: "Worker",
      value: beat === null ? "Never started" : beat > 180 ? "Offline" : "Online",
      note: beat === null ? undefined : `last heartbeat ${ago(beat)}`,
    },
    {
      label: "Upload → ready (p50)",
      value: duration(s.upload_to_ready.p50_s),
      note: `p95 ${duration(s.upload_to_ready.p95_s)} · last 7 days`,
    },
  ];
}

function when(iso: string) {
  const today = new Date().toDateString() === new Date(iso).toDateString();
  return today ? time(iso) : shortDate(iso);
}

// 30g System health (docs/reference/admin-system.html), from GET /admin/system.
export function SystemView() {
  const { data: s, loading, error, reload } = useAdminData<System>("/admin/system");

  return (
    <>
      <PageHead
        eyebrow="Queue, worker and AI providers"
        title="System "
        highlight="health"
        action={
          <button type="button" className="a-btn" onClick={reload}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
        }
      />
      <DataState loading={loading && !s} error={error} onRetry={reload} />
      {s && (
        <>
          <Tiles tiles={tiles(s)} />

          <div className="a-grid-2 sy-grid">
            <div className="a-stack">
              <section className="a-card" aria-labelledby="sy-jobs">
                <CardHead title="Jobs by type (24 h)" />
                {s.jobs.length === 0 ? (
                  <p className="a-muted">No jobs finished in the last 24 hours.</p>
                ) : (
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
                        {s.jobs.map((j) => (
                          <tr key={j.job}>
                            <td>{j.job}</td>
                            <td className="a-r">{num(j.done)}</td>
                            <td className="a-r">{num(j.failed)}</td>
                            <td className="a-r">{duration(j.p50_s)}</td>
                            <td className="a-r">{duration(j.p95_s)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="a-card" aria-labelledby="sy-fail">
                <CardHead title="Recent failures" sub="Permanent reasons fail at once; transient ones retry with backoff (FR-SEC-03/06)" />
                {s.failures.length === 0 ? (
                  <p className="a-muted">No failed jobs.</p>
                ) : (
                  <div className="a-table-wrap">
                    <table className="a-table" id="sy-fail">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Job</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.failures.map((f) => {
                          const permanent = PERMANENT.some((r) => f.reason.startsWith(r));
                          return (
                            <tr key={f.id}>
                              <td className="a-nw">{when(f.at)}</td>
                              <td className="a-nw">
                                {f.job}
                                <span className="sy-note">
                                  attempt {f.attempts} of {f.max_attempts}
                                </span>
                              </td>
                              <td>
                                <Chip tone={permanent ? "danger" : "warning"} icon={permanent ? "close" : undefined}>
                                  {f.reason || "unknown"}
                                </Chip>
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
              <section className="a-card" aria-labelledby="sy-ai">
                <CardHead title="AI providers" sub="A provider pauses after repeated errors and is retried automatically" />
                {s.health.breakers.length === 0 ? (
                  <p className="a-muted">No provider has been used yet.</p>
                ) : (
                  <div className="a-table-wrap">
                    <table className="a-table" id="sy-ai">
                      <thead>
                        <tr>
                          <th>Provider</th>
                          <th>Breaker</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.health.breakers.map((b) => (
                          <tr key={b.provider}>
                            <td>{PROVIDER_NAME[b.provider] ?? b.provider}</td>
                            <td>
                              <Chip tone={b.open ? "warning" : "success"}>{b.open ? "Open · paused" : "Closed · healthy"}</Chip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="a-card" aria-label="Supabase usage">
                <CardHead title="Supabase usage" />
                <p className="a-muted">
                  Database, storage, egress and realtime usage need the Supabase management API, which isn&apos;t connected
                  yet. See them in the Supabase dashboard under Usage.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}
