"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PayrollPeriod } from "@/lib/types";

function suggestNextPeriod(existing: PayrollPeriod[]): { start: string; end: string } {
  if (existing.length > 0) {
    // ต่อจากรอบล่าสุด (เรียงจากใหม่ไปเก่าแล้วในหน้า agency page)
    const latest = existing[0];
    const nextStart = new Date(latest.period_end);
    nextStart.setDate(nextStart.getDate() + 1);
    const day = nextStart.getDate();
    const y = nextStart.getFullYear();
    const m = nextStart.getMonth();
    const end = day <= 15 ? new Date(y, m, 15) : new Date(y, m + 1, 0);
    return { start: nextStart.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  // ไม่มีรอบเลย — เดาจากวันนี้ว่าอยู่ครึ่งแรกหรือครึ่งหลังของเดือน
  const today = new Date();
  const day = today.getDate();
  const y = today.getFullYear();
  const m = today.getMonth();
  if (day <= 15) {
    return { start: new Date(y, m, 1).toISOString().slice(0, 10), end: new Date(y, m, 15).toISOString().slice(0, 10) };
  }
  return { start: new Date(y, m, 16).toISOString().slice(0, 10), end: new Date(y, m + 1, 0).toISOString().slice(0, 10) };
}

export default function NewPeriodButton({ agencyId, existingPeriods }: { agencyId: string; existingPeriods: PayrollPeriod[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = suggestNextPeriod(existingPeriods);
  const [start, setStart] = useState(suggested.start);
  const [end, setEnd] = useState(suggested.end);

  async function handleCreate() {
    if (!start || !end || start >= end) {
      setError("กรุณาระบุวันที่เริ่ม-สิ้นสุดให้ถูกต้อง (วันสิ้นสุดต้องหลังวันเริ่ม)");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: period, error: periodErr } = await supabase
      .from("payroll_periods")
      .insert({ agency_id: agencyId, period_start: start, period_end: end, created_by: user?.id ?? null })
      .select("id")
      .single();

    if (periodErr || !period) {
      setError("สร้างรอบจ่ายไม่สำเร็จ: " + (periodErr?.message ?? "unknown error"));
      setLoading(false);
      return;
    }

    const { data: batch, error: batchErr } = await supabase
      .from("payroll_batches")
      .insert({ period_id: period.id, status: "draft" })
      .select("id")
      .single();

    if (batchErr || !batch) {
      setError("สร้างรายงานไม่สำเร็จ: " + (batchErr?.message ?? "unknown error"));
      setLoading(false);
      return;
    }

    router.push(`/clerk/${batch.id}`);
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={() => setOpen(true)}>
        + สร้างรอบจ่ายใหม่
      </button>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h3 style={{ marginBottom: 14, fontSize: 15 }}>สร้างรอบจ่ายใหม่</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field">
          <label>วันเริ่มรอบ</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>วันสิ้นสุดรอบ</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn primary" onClick={handleCreate} disabled={loading}>
          {loading ? "กำลังสร้าง..." : "สร้างและเปิดรายงาน →"}
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
