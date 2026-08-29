"use client";

import { useState } from "react";
import { formatThaiDateRange } from "@/lib/thai";

type Range = { start: string; end: string; count: number };

export default function PdfReportPicker({ ranges }: { ranges: Range[] }) {
  const [value, setValue] = useState(ranges[0] ? `${ranges[0].start}|${ranges[0].end}` : "");

  if (ranges.length === 0) return null;

  const [start, end] = value.split("|");
  const href = `/api/finance-report?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <select value={value} onChange={(e) => setValue(e.target.value)} style={{ fontSize: 13.5, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>
        {ranges.map((r) => (
          <option key={`${r.start}|${r.end}`} value={`${r.start}|${r.end}`}>
            {formatThaiDateRange(r.start, r.end)} ({r.count} แผนก)
          </option>
        ))}
      </select>
      <a className="btn" href={href}>
        ดาวน์โหลดรายงานสรุป (PDF)
      </a>
    </div>
  );
}
