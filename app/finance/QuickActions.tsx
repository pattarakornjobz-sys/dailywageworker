"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { BankCompanyCode, DetailWithEmployee, Employee, PayrollDetail } from "@/lib/types";

export function QuickReceiveButton({ batchId }: { batchId: string }) {
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
    <div>
      <button className="btn primary" onClick={handleClick} disabled={loading}>
        {loading ? "..." : "รับเรื่อง"}
      </button>
      {error && <div style={{ color: "var(--brick)", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// ปุ่มลัด "เริ่มโอนเงิน" จากหน้ารวม — กดแล้วขยายฟอร์มกรอกเลขที่เช็ค/วันโอน/รหัสบริษัทตรงในแถวนั้นเลย
// ไม่ต้องเข้าไปหน้ารายละเอียดก่อน (ดึงรายชื่อ/ยอดของ batch นี้เองตอนขยายฟอร์ม)
export function QuickTransferPanel({ batchId, companyCodes }: { batchId: string; companyCodes: BankCompanyCode[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DetailWithEmployee[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [checkNo, setCheckNo] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [companyCode, setCompanyCode] = useState(companyCodes[0]?.code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (rows !== null) return;
    const supabase = createClient();
    const { data: batchData } = await supabase.from("payroll_batches").select("period_id").eq("id", batchId).single();
    if (!batchData) {
      setFetchError("โหลดข้อมูลรายการนี้ไม่สำเร็จ");
      return;
    }
    const { data: detailsData } = await supabase
      .from("payroll_details")
      .select("id, period_id, employee_id, days_full, days_half, daily_rate, total_amount, employee_ack_at")
      .eq("period_id", batchData.period_id);
    const details = (detailsData ?? []) as PayrollDetail[];
    const employeeIds = details.map((d) => d.employee_id);
    const { data: employeesData } = employeeIds.length
      ? await supabase
          .from("employees")
          .select("id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status")
          .in("id", employeeIds)
      : { data: [] };
    const employeeById = new Map(((employeesData ?? []) as Employee[]).map((e) => [e.id, e]));
    const merged: DetailWithEmployee[] = details.map((d) => ({ ...d, employee: employeeById.get(d.employee_id)! })).filter((r) => r.employee);
    setRows(merged);
  }

  const totalAmount = rows?.reduce((s, r) => s + r.total_amount, 0) ?? 0;
  const missingAccount = rows?.filter((r) => !r.employee.bank_account_no) ?? [];

  async function handleSubmit() {
    if (!checkNo.trim() || !transferDate || !companyCode) {
      setError("กรอกเลขที่เช็ค วันที่โอน และรหัสบริษัทให้ครบ");
      return;
    }
    if (!rows || rows.length === 0) {
      setError("ไม่พบรายชื่อลูกจ้างของรอบนี้");
      return;
    }
    if (missingAccount.length > 0) {
      setError(`มีลูกจ้าง ${missingAccount.length} คนยังไม่มีเลขบัญชี — เพิ่มให้ครบก่อน (หน้ารายละเอียด หรือหน้าจัดการลูกจ้าง)`);
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

  if (!open) {
    return (
      <button className="btn primary" onClick={handleOpen}>
        เริ่มโอนเงิน
      </button>
    );
  }

  return (
    <div className="card" style={{ minWidth: 460, margin: "6px 0" }}>
      {fetchError && <div className="error-box">{fetchError}</div>}
      {rows === null && !fetchError && <div style={{ fontSize: 13, color: "var(--muted)" }}>กำลังโหลดรายชื่อ...</div>}
      {rows !== null && (
        <>
          {missingAccount.length > 0 && (
            <div className="error-box">
              ลูกจ้าง {missingAccount.length} คนยังไม่มีเลขบัญชีธนาคาร (
              {missingAccount.map((r) => r.employee.first_name).join(", ")})
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>เลขที่เช็ค</label>
              <input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} placeholder="เช่น 0012345" />
            </div>
            <div className="field">
              <label>วันที่โอนเงิน</label>
              <input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div className="field">
              <label>รหัสบริษัท</label>
              <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)}>
                {companyCodes.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", margin: "6px 0 12px" }}>
            {rows.length} รายการ · ยอดรวม {totalAmount.toLocaleString()} บาท
          </div>
          {error && <div className="error-box">{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={handleSubmit} disabled={loading}>
              {loading ? "กำลังบันทึก..." : "ยืนยัน — เริ่มโอนเงิน"}
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
          </div>
        </>
      )}
    </div>
  );
}
