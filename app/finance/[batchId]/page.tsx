import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, effectiveStatus } from "@/lib/statusLabels";
import { ReceiveButton, RejectButton, TransferForm, CompleteButton } from "./FinanceActions";
import type {
  Agency,
  BankCompanyCode,
  BankTransferBatch,
  BankTransferItem,
  DetailWithEmployee,
  Employee,
  PayrollBatch,
  PayrollDetail,
  PayrollPeriod,
} from "@/lib/types";

export default async function FinanceBatchDetail({ params }: { params: { batchId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: batchData } = await supabase
    .from("payroll_batches")
    .select("id, period_id, status, review_note, submitted_at, created_at, updated_at")
    .eq("id", params.batchId)
    .single();
  const batch = batchData as PayrollBatch | null;
  if (!batch) notFound();

  const { data: periodData } = await supabase
    .from("payroll_periods")
    .select("id, agency_id, period_start, period_end")
    .eq("id", batch.period_id)
    .single();
  const period = periodData as PayrollPeriod | null;
  if (!period) notFound();

  const { data: agencyData } = await supabase.from("agencies").select("id, name, code").eq("id", period.agency_id).single();
  const agency = agencyData as Agency | null;

  const { data: detailsData } = await supabase
    .from("payroll_details")
    .select("id, period_id, employee_id, days_full, days_half, daily_rate, total_amount, employee_ack_at")
    .eq("period_id", period.id);
  const details = (detailsData ?? []) as PayrollDetail[];

  const employeeIds = details.map((d) => d.employee_id);
  const { data: employeesData } = employeeIds.length
    ? await supabase
        .from("employees")
        .select("id, agency_id, prefix, first_name, last_name, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch")
        .in("id", employeeIds)
    : { data: [] };
  const employeeById = new Map(((employeesData ?? []) as Employee[]).map((e) => [e.id, e]));

  const rows: DetailWithEmployee[] = details
    .map((d) => ({ ...d, employee: employeeById.get(d.employee_id)! }))
    .filter((r) => r.employee);

  const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0);

  const { data: companyCodesData } = await supabase
    .from("bank_company_codes")
    .select("code, name, is_active")
    .eq("is_active", true)
    .order("code");
  const companyCodes = (companyCodesData ?? []) as BankCompanyCode[];

  // ถ้ามีรายการโอนเงินที่เชื่อมกับ batch นี้แล้ว ดึงมาแสดง
  let transferBatch: BankTransferBatch | null = null;
  let transferItems: BankTransferItem[] = [];
  if (batch.status === "transferring" || batch.status === "paid") {
    const { data: sourceData } = await supabase
      .from("bank_transfer_sources")
      .select("transfer_batch_id")
      .eq("payroll_batch_id", batch.id)
      .maybeSingle();
    if (sourceData) {
      const { data: tbData } = await supabase
        .from("bank_transfer_batches")
        .select("id, transfer_date, total_amount, total_count, check_no, company_code, company_name, file_url, generated_at")
        .eq("id", sourceData.transfer_batch_id)
        .single();
      transferBatch = tbData as BankTransferBatch | null;

      if (transferBatch) {
        const { data: itemsData } = await supabase
          .from("bank_transfer_items")
          .select("id, transfer_batch_id, employee_id, bank_name, bank_branch, account_no, account_name, amount, ref_no")
          .eq("transfer_batch_id", transferBatch.id);
        transferItems = (itemsData ?? []) as BankTransferItem[];
      }
    }
  }

  const displayStatus = effectiveStatus(batch.status, transferBatch?.transfer_date ?? null);

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            การเงิน
          </div>
          <strong>
            {agency?.name} · {period.period_start} – {period.period_end}
          </strong>
        </div>
        <span className="btn" style={{ cursor: "default" }}>
          สถานะ: {STATUS_LABEL[displayStatus]}
        </span>
      </div>

      <div className="page">
        {batch.status === "rejected" && batch.review_note && (
          <div className="error-box">เหตุผลที่ตีกลับไปก่อนหน้า: {batch.review_note}</div>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ–นามสกุล</th>
                <th>วันทำงาน</th>
                <th>จำนวนเงิน</th>
                <th>เลขบัญชี</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee.fingerprint_no}</td>
                  <td>
                    {r.employee.prefix} {r.employee.first_name} {r.employee.last_name}
                  </td>
                  <td>{r.days_full + r.days_half}</td>
                  <td>{r.total_amount.toLocaleString()}</td>
                  <td style={{ color: r.employee.bank_account_no ? "var(--ink-soft)" : "var(--brick)" }}>
                    {r.employee.bank_account_no ?? "ไม่มีเลขบัญชี"}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, background: "var(--line-soft)" }}>
                <td colSpan={3}>รวม</td>
                <td>{totalAmount.toLocaleString()} บาท</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {batch.status === "submitted_to_central" && (
          <div style={{ display: "flex", gap: 10 }}>
            <ReceiveButton batchId={batch.id} />
            <RejectButton batchId={batch.id} />
          </div>
        )}

        {batch.status === "finance_received" && (
          <>
            <TransferForm batchId={batch.id} rows={rows} companyCodes={companyCodes} />
            <div style={{ marginTop: 10 }}>
              <RejectButton batchId={batch.id} />
            </div>
          </>
        )}

        {transferBatch && (
          <div className="card">
            <h3 style={{ marginBottom: 14, fontSize: 15 }}>รายละเอียดการโอนเงิน</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, fontSize: 13.5, marginBottom: 16 }}>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11.5 }}>เลขที่เช็ค</div>
                {transferBatch.check_no}
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11.5 }}>วันที่โอน</div>
                {transferBatch.transfer_date}
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11.5 }}>จำนวนรายการ</div>
                {transferBatch.total_count} รายการ
              </div>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 11.5 }}>ยอดรวม</div>
                {transferBatch.total_amount.toLocaleString()} บาท
              </div>
            </div>

            <details style={{ marginBottom: 16 }}>
              <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--accent-ink)" }}>
                ดูรายละเอียดรายการโอนทั้งหมด ({transferItems.length})
              </summary>
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>ชื่อบัญชี</th>
                    <th>เลขบัญชี</th>
                    <th>ธนาคาร</th>
                    <th>จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {transferItems.map((it) => (
                    <tr key={it.id}>
                      <td>{it.account_name}</td>
                      <td>{it.account_no}</td>
                      <td>{it.bank_name}</td>
                      <td>{it.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <a className="btn primary" href={`/api/bank-export/${transferBatch.id}`}>
                ดาวน์โหลดไฟล์โอนเงิน (.txt)
              </a>
              {batch.status === "transferring" && <CompleteButton batchId={batch.id} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
