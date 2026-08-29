"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, STATUS_COLOR, effectiveStatus } from "@/lib/statusLabels";
import type { Agency, BankCompanyCode, DetailWithEmployee, Employee, PayrollBatch, PayrollDetail, PayrollPeriod } from "@/lib/types";

type Row = PayrollBatch & { period: PayrollPeriod; total: number };
type Group = { agency: Agency; rows: Row[] };

const SELECTABLE = ["submitted_to_central", "finance_received"];

export default function FinanceBoard({ groups, companyCodes }: { groups: Group[]; companyCodes: BankCompanyCode[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const allRows = useMemo(() => groups.flatMap((g) => g.rows.map((r) => ({ ...r, agency: g.agency }))), [groups]);
  const selectedRows = allRows.filter((r) => selected.has(r.id));
  const selectedStatuses = new Set(selectedRows.map((r) => r.status));
  const mixedSelection = selectedStatuses.size > 1;
  const selectedTotal = selectedRows.reduce((s, r) => s + r.total, 0);

  function toggle(id: string) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(rows: Row[]) {
    setError(null);
    const ids = rows.filter((r) => SELECTABLE.includes(r.status)).map((r) => r.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleBulkReceive() {
    if (selectedRows.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const ids = selectedRows.map((r) => r.id);
    const { error: err } = await supabase.from("payroll_batches").update({ status: "finance_received" }).in("id", ids);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div>
      {groups.map(({ agency, rows }) => {
        const groupIds = rows.filter((r) => SELECTABLE.includes(r.status)).map((r) => r.id);
        const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        return (
          <div key={agency.id} style={{ marginBottom: 26 }}>
            <h3 style={{ fontSize: 14.5, marginBottom: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 400 }}>{agency.code}</span>
              {agency.name}
            </h3>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      {groupIds.length > 0 && (
                        <input type="checkbox" checked={groupAllSelected} onChange={() => toggleGroup(rows)} />
                      )}
                    </th>
                    <th>ช่วงรอบจ่าย</th>
                    <th>ยอดรวม</th>
                    <th>สถานะ</th>
                    <th>การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((batch) => {
                    const status = effectiveStatus(batch.status, null);
                    const selectable = SELECTABLE.includes(batch.status);
                    return (
                      <tr key={batch.id}>
                        <td>
                          {selectable && (
                            <input type="checkbox" checked={selected.has(batch.id)} onChange={() => toggle(batch.id)} />
                          )}
                        </td>
                        <td>
                          {batch.period.period_start} – {batch.period.period_end}
                        </td>
                        <td>{batch.total.toLocaleString()} บาท</td>
                        <td>
                          <span className="pill" style={{ background: "#0000", color: STATUS_COLOR[status] }}>
                            ● {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td>
                          <Link href={`/finance/${batch.id}`} className="btn">
                            รายละเอียด →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {selected.size > 0 && (
        <div
          className="no-print"
          style={{
            position: "sticky",
            bottom: 16,
            marginTop: 12,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "14px 18px",
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13.5 }}>
            เลือกแล้ว {selected.size} รายการ · ยอดรวม {selectedTotal.toLocaleString()} บาท
          </div>
          {error && <div style={{ color: "var(--brick)", fontSize: 12.5 }}>{error}</div>}
          {mixedSelection && (
            <div style={{ color: "var(--brick)", fontSize: 12.5 }}>
              เลือกได้เฉพาะรายการสถานะเดียวกัน (รอรับเรื่อง หรือ รอโอนเงิน อย่างใดอย่างหนึ่ง)
            </div>
          )}
          {!mixedSelection && selectedStatuses.has("submitted_to_central") && (
            <button className="btn primary" onClick={handleBulkReceive} disabled={busy}>
              {busy ? "กำลังบันทึก..." : `รับเรื่องที่เลือก (${selected.size})`}
            </button>
          )}
          {!mixedSelection && selectedStatuses.has("finance_received") && (
            <button className="btn primary" onClick={() => setTransferOpen(true)} disabled={busy}>
              กำหนดการโอนเงิน ({selected.size} รายการ)
            </button>
          )}
          <button className="btn" onClick={() => setSelected(new Set())}>
            ยกเลิกการเลือก
          </button>
        </div>
      )}

      {transferOpen && (
        <BulkTransferModal
          rows={selectedRows}
          companyCodes={companyCodes}
          onClose={() => setTransferOpen(false)}
          onDone={() => {
            setTransferOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function BulkTransferModal({
  rows,
  companyCodes,
  onClose,
  onDone,
}: {
  rows: (Row & { agency: Agency })[];
  companyCodes: BankCompanyCode[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [loadingRows, setLoadingRows] = useState(true);
  const [detailRows, setDetailRows] = useState<DetailWithEmployee[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [checkNo, setCheckNo] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [companyCode, setCompanyCode] = useState(companyCodes[0]?.code ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const periodIds = rows.map((r) => r.period.id);
      const { data: detailsData, error: dErr } = await supabase
        .from("payroll_details")
        .select("id, period_id, employee_id, days_full, days_half, daily_rate, total_amount, employee_ack_at")
        .in("period_id", periodIds);
      if (dErr) {
        setFetchError("โหลดรายชื่อลูกจ้างไม่สำเร็จ: " + dErr.message);
        setLoadingRows(false);
        return;
      }
      const details = (detailsData ?? []) as PayrollDetail[];
      const employeeIds = [...new Set(details.map((d) => d.employee_id))];
      const { data: employeesData } = employeeIds.length
        ? await supabase
            .from("employees")
            .select("id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status")
            .in("id", employeeIds)
        : { data: [] };
      const employeeById = new Map(((employeesData ?? []) as Employee[]).map((e) => [e.id, e]));
      const merged: DetailWithEmployee[] = details.map((d) => ({ ...d, employee: employeeById.get(d.employee_id)! })).filter((r) => r.employee);
      setDetailRows(merged);
      setLoadingRows(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalAmount = detailRows.reduce((s, r) => s + r.total_amount, 0);
  const missingAccount = detailRows.filter((r) => !r.employee.bank_account_no);

  async function handleSubmit() {
    if (!checkNo.trim() || !transferDate || !companyCode) {
      setError("กรอกเลขที่เช็ค วันที่โอน และรหัสบริษัทให้ครบ");
      return;
    }
    if (detailRows.length === 0) {
      setError("ไม่พบรายชื่อลูกจ้างของรายการที่เลือก");
      return;
    }
    if (missingAccount.length > 0) {
      setError(`มีลูกจ้าง ${missingAccount.length} คนยังไม่มีเลขบัญชี — เพิ่มให้ครบก่อน (หน้าจัดการลูกจ้างของแต่ละหน่วยงาน)`);
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
        total_count: detailRows.length,
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

    const items = detailRows.map((r) => ({
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

    const sources = rows.map((r) => ({ transfer_batch_id: transferBatch.id, payroll_batch_id: r.id }));
    const { error: sourceErr } = await supabase.from("bank_transfer_sources").insert(sources);
    if (sourceErr) {
      setError("เชื่อมรายการไม่สำเร็จ: " + sourceErr.message);
      setLoading(false);
      return;
    }

    const { error: statusErr } = await supabase
      .from("payroll_batches")
      .update({ status: "transferring" })
      .in("id", rows.map((r) => r.id));
    if (statusErr) {
      setError("อัปเดตสถานะไม่สำเร็จ: " + statusErr.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    onDone();
  }

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div className="card" style={{ width: 560, maxHeight: "86vh", overflowY: "auto" }}>
        <h3 style={{ marginBottom: 6, fontSize: 15 }}>กำหนดการโอนเงิน</h3>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          {rows.length} หน่วยงานที่เลือก: {rows.map((r) => r.agency.code).join(", ")} — กรอกครั้งเดียว รวมเป็นไฟล์โอนเงินเดียวกัน
        </p>

        {fetchError && <div className="error-box">{fetchError}</div>}
        {loadingRows && !fetchError && <div style={{ fontSize: 13, color: "var(--muted)" }}>กำลังโหลดรายชื่อ...</div>}

        {!loadingRows && !fetchError && (
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
            <div style={{ fontSize: 13, color: "var(--ink-soft)", margin: "10px 0 14px" }}>
              {detailRows.length} รายการ · ยอดรวม {totalAmount.toLocaleString()} บาท
            </div>
            {error && <div className="error-box">{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" onClick={handleSubmit} disabled={loading}>
                {loading ? "กำลังบันทึก..." : "ยืนยัน — เริ่มโอนเงิน"}
              </button>
              <button className="btn" onClick={onClose}>
                ยกเลิก
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
