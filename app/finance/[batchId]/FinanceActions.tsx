"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BankCompanyCode, DetailWithEmployee } from "@/lib/types";

export function ReceiveButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("payroll_batches").update({ status: "finance_received" }).eq("id", batchId);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="no-print">
      {error && <div className="error-box">{error}</div>}
      <button className="btn primary" onClick={handleClick} disabled={loading}>
        {loading ? "กำลังบันทึก..." : "รับเรื่อง — เอกสารถึงมือแล้ว"}
      </button>
    </div>
  );
}

export function RejectButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReject() {
    if (!note.trim()) {
      setError("กรุณาระบุเหตุผลที่ตีกลับ");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("payroll_batches")
      .update({ status: "rejected", review_note: note.trim() })
      .eq("id", batchId);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn danger no-print" onClick={() => setOpen(true)}>
        ตีกลับ
      </button>
    );
  }

  return (
    <div className="card no-print" style={{ maxWidth: 420 }}>
      <div className="field">
        <label>เหตุผลที่ตีกลับ</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ยอดเงินไม่ตรงกับเอกสาร" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn danger" onClick={handleReject} disabled={loading}>
          {loading ? "กำลังบันทึก..." : "ยืนยันตีกลับ"}
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export function TransferForm({
  batchId,
  rows,
  companyCodes,
}: {
  batchId: string;
  rows: DetailWithEmployee[];
  companyCodes: BankCompanyCode[];
}) {
  const router = useRouter();
  const [checkNo, setCheckNo] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [companyCode, setCompanyCode] = useState(companyCodes[0]?.code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0);
  const missingAccount = rows.filter((r) => !r.employee.bank_account_no);

  async function handleSubmit() {
    if (!checkNo.trim() || !transferDate || !companyCode) {
      setError("กรอกเลขที่เช็ค วันที่โอน และรหัสบริษัทให้ครบ");
      return;
    }
    if (missingAccount.length > 0) {
      setError(`มีลูกจ้าง ${missingAccount.length} คนที่ยังไม่มีเลขบัญชีธนาคารในฐานข้อมูล — เพิ่มให้ครบก่อนสร้างไฟล์โอน`);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const companyName = companyCodes.find((c) => c.code === companyCode)?.name ?? "SUPPORT FOUNDATION";

    const { data: transferBatch, error: tbErr } = await supabase
      .from("bank_transfer_batches")
      .insert({
        transfer_date: transferDate,
        total_amount: totalAmount,
        total_count: rows.length,
        check_no: checkNo.trim(),
        company_code: companyCode,
        company_name: companyName,
      })
      .select("id")
      .single();

    if (tbErr || !transferBatch) {
      setError("สร้างรายการโอนไม่สำเร็จ: " + (tbErr?.message ?? "unknown error"));
      setLoading(false);
      return;
    }

    const items = rows.map((r) => ({
      transfer_batch_id: transferBatch.id,
      employee_id: r.employee.id,
      bank_name: r.employee.bank_name ?? "",
      bank_branch: r.employee.bank_branch,
      account_no: r.employee.bank_account_no ?? "",
      account_name: `${r.employee.prefix} ${r.employee.first_name} ${r.employee.last_name}`.trim(),
      amount: r.total_amount,
      ref_no: `PR-${transferDate.replaceAll("-", "")}-${r.employee.fingerprint_no}`,
    }));

    const { error: itemsErr } = await supabase.from("bank_transfer_items").insert(items);
    if (itemsErr) {
      setError("บันทึกรายการโอนไม่สำเร็จ: " + itemsErr.message);
      setLoading(false);
      return;
    }

    const { error: sourceErr } = await supabase
      .from("bank_transfer_sources")
      .insert({ transfer_batch_id: transferBatch.id, payroll_batch_id: batchId });
    if (sourceErr) {
      setError("เชื่อมรายการไม่สำเร็จ: " + sourceErr.message);
      setLoading(false);
      return;
    }

    const { error: statusErr } = await supabase.from("payroll_batches").update({ status: "transferring" }).eq("id", batchId);
    if (statusErr) {
      setError("อัปเดตสถานะไม่สำเร็จ: " + statusErr.message);
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="card no-print">
      <h3 style={{ marginBottom: 14, fontSize: 15 }}>กำหนดการโอนเงิน</h3>
      {missingAccount.length > 0 && (
        <div className="error-box">
          ลูกจ้าง {missingAccount.length} คนยังไม่มีเลขบัญชีธนาคารในฐานข้อมูล ({missingAccount.map((r) => r.employee.first_name).join(", ")})
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="field">
          <label>เลขที่เช็ค</label>
          <input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} placeholder="เช่น 0012345" />
        </div>
        <div className="field">
          <label>วันที่โอนเงิน</label>
          <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
        </div>
        <div className="field">
          <label>รหัสบริษัท (ไฟล์โอนเงิน)</label>
          <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)}>
            {companyCodes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "10px 0 16px" }}>
        จำนวนรายการโอน {rows.length} รายการ · ยอดรวม {totalAmount.toLocaleString()} บาท
      </div>
      {error && <div className="error-box">{error}</div>}
      <button className="btn primary" onClick={handleSubmit} disabled={loading}>
        {loading ? "กำลังบันทึก..." : "ยืนยัน — เริ่มดำเนินการโอนเงิน"}
      </button>
    </div>
  );
}

export function CompleteButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm("ยืนยันว่าธนาคารโอนเงินสำเร็จแล้วใช่หรือไม่?")) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.from("payroll_batches").update({ status: "paid" }).eq("id", batchId);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="no-print">
      {error && <div className="error-box">{error}</div>}
      <button className="btn primary" onClick={handleClick} disabled={loading}>
        {loading ? "กำลังบันทึก..." : "ยืนยันเสร็จสิ้น"}
      </button>
    </div>
  );
}
