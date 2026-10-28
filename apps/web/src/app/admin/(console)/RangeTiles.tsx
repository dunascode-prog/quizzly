"use client";

import { useState } from "react";
import { Segmented } from "@/components/admin/Segmented";
import { PageHead, Tiles, type TileData } from "@/components/admin/ui";
import { RANGES, type Range } from "@/lib/admin/mock";

// Overview head and KPI tiles: the range picker in the head switches the tiles below it.
export function RangeTiles({
  eyebrow,
  title,
  highlight,
  tiles,
}: {
  eyebrow: string;
  title: string;
  highlight: string;
  tiles: Record<Range, TileData[]>;
}) {
  const [range, setRange] = useState<Range>("today");
  return (
    <>
      <PageHead
        eyebrow={eyebrow}
        title={title}
        highlight={highlight}
        action={<Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />}
      />
      <Tiles tiles={tiles[range]} />
    </>
  );
}
