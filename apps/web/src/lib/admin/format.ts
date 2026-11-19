// Formatting for the admin pages. Times are shown in Lagos time, whatever the viewer's clock says.

import type { BarPoint, Tone } from "@/components/admin/ui";
import { type Health, PROVIDER_NAME } from "@/lib/admin/api";

const TZ = "Africa/Lagos";

export const usd = (v: number) => `$${v.toFixed(2)}`;
export const usd3 = (v: number) => `$${v.toFixed(3)}`;
export const num = (v: number) => v.toLocaleString("en-GB");
export const pct = (share: number | null) => (share === null ? "—" : `${Math.round(share * 100)}%`);

export function lagosDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

export function shortDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
}

export function time(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function greeting(iso: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  return hour < 12 ? "Good morning, " : hour < 17 ? "Good afternoon, " : "Good evening, ";
}

/** The last `n` days in Lagos as YYYY-MM-DD, oldest first, ending today. */
export function lastDays(n: number): string[] {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  return Array.from({ length: n }, (_, i) => day(new Date(Date.now() - (n - 1 - i) * 86_400_000)));
}

/** Daily bars from `{day, value}` rows, with a zero for days that have none. */
export function dayBars(rows: { day: string; value: number }[], n = 7): BarPoint[] {
  const by = new Map(rows.map((r) => [r.day.slice(0, 10), r.value]));
  return lastDays(n).map((d) => {
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
    return { day: weekday[0], label: `${weekday} ${d.slice(8)}`, value: by.get(d) ?? 0 };
  });
}

export function ago(seconds: number): string {
  if (seconds < 90) return `${seconds} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export function duration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

export type HealthRow = { label: string; tone: Tone; text: string };

/** The worker is late after 3 missed heartbeats (one a minute). */
export function healthRows(h: Health): HealthRow[] {
  const worker: HealthRow =
    h.worker_beat_s === null
      ? { label: "Worker", tone: "danger", text: "Never started" }
      : h.worker_beat_s > 180
        ? { label: "Worker", tone: "danger", text: `Offline · beat ${ago(h.worker_beat_s)}` }
        : { label: "Worker", tone: "success", text: `Online · beat ${ago(h.worker_beat_s)}` };
  return [
    {
      label: "Job queue",
      tone: h.failed_24h ? "warning" : "success",
      text: `${h.waiting} queued · ${h.running} running · ${h.failed_24h} failed in 24 h`,
    },
    worker,
    ...h.breakers.map(
      (b): HealthRow => ({
        label: PROVIDER_NAME[b.provider] ?? b.provider,
        tone: b.open ? "warning" : "success",
        text: b.open ? "Paused after errors" : "Healthy",
      }),
    ),
  ];
}
