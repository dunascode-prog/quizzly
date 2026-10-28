"use client";

import { useState } from "react";
import { Segmented } from "@/components/admin/Segmented";
import { PageHead, Tiles, type TileData } from "@/components/admin/ui";
import { RANGES, type Range } from "@/lib/admin/mock";

// Page head and KPI tiles: the range picker in the head switches the tiles (and eyebrow) below it.
export function RangeTiles({
  eyebrow,
  title,
  highlight,
  tiles,
  initial = "today",
}: {
  eyebrow: string | Record<Range, string>;
  title: string;
  highlight: string;
  tiles: Record<Range, TileData[]>;
  initial?: Range;
}) {
  const [range, setRange] = useState<Range>(initial);
  return (
    <>
      <PageHead
        eyebrow={typeof eyebrow === "string" ? eyebrow : eyebrow[range]}
        title={title}
        highlight={highlight}
        action={<Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />}
      />
      <Tiles tiles={tiles[range]} />
    </>
  );
}
