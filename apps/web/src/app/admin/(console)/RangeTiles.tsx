"use client";

import { Segmented } from "@/components/admin/Segmented";
import { PageHead, Tiles, type TileData } from "@/components/admin/ui";
import type { Range } from "@/lib/admin/api";

export const RANGES = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const satisfies readonly { value: Range; label: string }[];

// Page head and KPI tiles: the range picker in the head chooses the range the page loads.
export function RangeTiles({
  eyebrow,
  title,
  highlight,
  tiles,
  range,
  onRange,
}: {
  eyebrow: string;
  title: string;
  highlight: string;
  tiles: TileData[];
  range: Range;
  onRange: (r: Range) => void;
}) {
  return (
    <>
      <PageHead
        eyebrow={eyebrow}
        title={title}
        highlight={highlight}
        action={<Segmented label="Date range" options={RANGES} value={range} onChange={onRange} />}
      />
      <Tiles tiles={tiles} />
    </>
  );
}
