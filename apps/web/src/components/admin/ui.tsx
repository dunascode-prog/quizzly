// Building blocks shared by the admin pages (docs/reference/admin-*.html). Styles live in src/app/admin/admin.css.

import { Icon, type IconName } from "@/components/Icon";

/** Headline ending in one highlighted word: `<PageHead title="Reports " highlight="queue" />`, or "Take" + "downs". */
export function PageHead({
  eyebrow,
  title,
  highlight,
  action,
}: {
  eyebrow: React.ReactNode;
  /** Text before the highlight, including any trailing space. */
  title: string;
  highlight: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="a-head">
      <div className="a-head-text">
        <span className="a-eyebrow">{eyebrow}</span>
        <h1 className="a-h1">
          {title}
          <span className="a-hl">{highlight}</span>
        </h1>
      </div>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "outline" | "ink";

const toneIcon: Partial<Record<Tone, IconName>> = { success: "check", warning: "warning", danger: "warning" };

/** Type or status pill. Success and warning carry their icon so colour is never the only signal. */
export function Chip({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName | null; children: React.ReactNode }) {
  const name = icon === undefined ? toneIcon[tone] : icon;
  return (
    <span className={`a-chip${tone === "neutral" ? "" : ` a-chip-${tone}`}`}>
      {name && <Icon name={name} size={14} strokeWidth={2.6} />}
      {children}
    </span>
  );
}

export type TileData = { label: string; value: string; note?: string; ink?: boolean };

export function Tiles({ tiles }: { tiles: TileData[] }) {
  return (
    <div className="a-tiles">
      {tiles.map((t) => (
        <div key={t.label} className={`a-tile${t.ink ? " a-on-ink" : ""}`}>
          <span className="a-tile-label">{t.label}</span>
          <span className="a-num a-tile-value">{t.value}</span>
          {t.note && <span className="a-tile-note">{t.note}</span>}
        </div>
      ))}
    </div>
  );
}

export function CardHead({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="a-card-head">
      <div className="a-card-title">
        <h2 className="a-h2">{title}</h2>
        {sub && <span className="a-sub">{sub}</span>}
      </div>
      {action}
    </div>
  );
}

/** A filled share bar: `value` of `max`. `light` is for surface cards, the default is for ink cards. */
export function Meter({ value, max = 100, light = false, label }: { value: number; max?: number; light?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={`a-meter${light ? " a-meter-light" : ""}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export type BarPoint = { day: string; label: string; value: number };

/** Daily bars on an ink card; the last bar is today and is labelled with its value. */
export function DayBars({
  points,
  height = 128,
  label,
  format,
}: {
  points: BarPoint[];
  height?: number;
  label: string;
  format: (v: number) => string;
}) {
  const max = Math.max(...points.map((p) => p.value), 0.0001);
  const plot = height * 0.68; // the tallest bar leaves room above it for today's value label
  return (
    <>
      <div className="a-bars" role="img" aria-label={label} style={{ height }}>
        {points.map((p, i) => {
          const now = i === points.length - 1;
          return (
            <div key={p.label} className={`a-bar${now ? " a-bar-now" : ""}`} title={`${p.label} · ${format(p.value)}`}>
              {now && <span className="a-bar-value">{format(p.value)}</span>}
              <span className="a-bar-fill" style={{ height: Math.max(2, Math.round((p.value / max) * plot)) }} />
            </div>
          );
        })}
      </div>
      <div className="a-bar-days" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.label} className={i === points.length - 1 ? "a-now" : undefined}>
            {i === points.length - 1 ? "Today" : p.day}
          </span>
        ))}
      </div>
    </>
  );
}
