"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PayrollPeriod } from "@/lib/types";

type ImportResult = {
  employeesCreated: number;
  scansImported: number;
  rowsSkipped: number;
  skippedReasons: string[];
};

export default function ImportForm({ agencyId, periods }: { agencyId: string; periods: PayrollPeriod[] }) {
  const router = useRouter();
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit() {
    if (!periodId) {
      setError("เลือกรอบจ่ายที่จะนำเข้าก่อน");
      return;
    }
    if (!file) {
      setError("เลือกไฟล์สแกนนิ้ว (.xlsx หรือ .xls) ก่อน");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("agencyId", agencyId);
    formData.append("periodId", periodId);

    try {
      const res = await fetch("/api/import-scans", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "นำเข้าไม่สำเร็จ");
        setLoading(false);
        return;
      }
      setResult(json as ImportResult);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    }
    setLoading(false);
  }

  if (periods.length === 0) {
    return (
      <div className="error-box">
        หน่วยงานนี้ยังไม่มีรอบจ่ายเลย — กลับไปที่หน้าหน่วยงานแล้วกด "สร้างรอบจ่ายใหม่" ก่อน ถึงจะนำเข้าไฟล์สแกนนิ้วได้
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ marginBottom: 10, fontSize: 15 }}>นำเข้าไฟล์สแกนนิ้ว</h3>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
          ไฟล์ต้องเป็น .xlsx หรือ .xls ตามเทมเพลตที่กำหนด (คอลัมน์: เลขสแกนนิ้ว, คำนำหน้า, ชื่อ, นามสกุล, วันที่, เวลาเข้า,
          เวลาออก) — ถ้าเลขสแกนนิ้วยังไม่มีในระบบ จะสร้างลูกจ้างใหม่ให้อัตโนมัติ (ค่าจ้าง/วัน ตั้งต้นที่ 350 บาท แก้ทีหลังได้ที่
          หน้าจัดการลูกจ้าง) หลังนำเข้าเสร็จ ระบบจะคำนวณวันทำงาน/ยอดเงินของรอบนี้ใหม่ทั้งหมดให้อัตโนมัติ
        </p>

        <a href="/template-scan-import.xlsx" download className="btn" style={{ marginBottom: 16, display: "inline-flex" }}>
          ดาวน์โหลดเทมเพลต .xlsx
        </a>

        <div className="field">
          <label>รอบจ่ายที่จะนำเข้า</label>
          <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.period_start} – {p.period_end}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>ไฟล์สแกนนิ้ว</label>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>

        {error && <div className="error-box">{error}</div>}

        <button className="btn primary" onClick={handleSubmit} disabled={loading}>
          {loading ? "กำลังนำเข้า..." : "นำเข้าไฟล์"}
        </button>
      </div>

      {result && (
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <h3 style={{ marginBottom: 10, fontSize: 15 }}>ผลการนำเข้า</h3>
          <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
            <div>ลูกจ้างใหม่ที่สร้างอัตโนมัติ: {result.employeesCreated} คน</div>
            <div>แถวข้อมูลสแกนนิ้วที่นำเข้า/อัปเดต: {result.scansImported} แถว</div>
            <div>แถวที่ข้าม (ข้อมูลไม่ครบ/ผิดรูปแบบ): {result.rowsSkipped} แถว</div>
          </div>
          {result.skippedReasons.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--accent-ink)" }}>ดูรายละเอียดแถวที่ข้าม</summary>
              <ul style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 8 }}>
                {result.skippedReasons.slice(0, 30).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </details>
          )}
          <div style={{ marginTop: 14 }}>
            เข้าไปดูสรุปยอดที่คำนวณใหม่ได้ที่หน้ารายงานของรอบจ่ายนี้ (จากหน้าหน่วยงาน)
          </div>
        </div>
      )}
    </div>
  );
}
