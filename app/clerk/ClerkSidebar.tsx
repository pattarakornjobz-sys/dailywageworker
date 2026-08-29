"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Agency } from "@/lib/types";

export default function ClerkSidebar({ agencies, fullName }: { agencies: Agency[]; fullName: string }) {
  const pathname = usePathname();

  return (
    <div
      className="no-print"
      style={{
        width: 240,
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
        minHeight: "100vh",
        padding: "20px 0",
      }}
    >
      <div style={{ padding: "0 20px 16px", borderBottom: "1px solid var(--line-soft)", marginBottom: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
          ธุรการต้นสังกัด
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>{fullName}</div>
      </div>

      <Link
        href="/clerk"
        style={{
          display: "block",
          padding: "9px 20px",
          fontSize: 13.5,
          fontWeight: 500,
          color: pathname === "/clerk" ? "var(--accent-ink)" : "var(--ink-soft)",
          background: pathname === "/clerk" ? "var(--accent-soft)" : "transparent",
          textDecoration: "none",
        }}
      >
        ภาพรวมทุกหน่วยงาน
      </Link>

      <div style={{ margin: "14px 20px 6px", fontSize: 11, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase" }}>
        หน่วยงาน
      </div>

      <div style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        {agencies.map((a) => {
          const active = pathname.startsWith(`/clerk/agency/${a.id}`);
          return (
            <Link
              key={a.id}
              href={`/clerk/agency/${a.id}`}
              style={{
                display: "block",
                padding: "8px 20px",
                fontSize: 13,
                color: active ? "var(--accent-ink)" : "var(--ink-soft)",
                background: active ? "var(--accent-soft)" : "transparent",
                textDecoration: "none",
                borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: 10.5 }}>{a.code}</div>
              {a.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
