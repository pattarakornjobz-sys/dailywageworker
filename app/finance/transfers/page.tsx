import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Agency, BankTransferBatch, PayrollBatch, PayrollPeriod, Profile } from "@/lib/types";

export default async function TransferSummary() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, full_name, role, agency_id")
    .eq("id", user.id)
    .single();
  const profile = profileData as Profile | null;
  if (!profile || profile.role !== "finance_officer") redirect("/login?error=unsupported_role");

  const { data: transferBatchesData } = await supabase
    .from("bank_transfer_batches")
    .select("id, transfer_date, total_amount, total_count, check_no, company_code, company_name, file_url, generated_at")
    .order("generated_at", { ascending: false });
  const transferBatches = (transferBatchesData ?? []) as BankTransferBatch[];

  const transferIds = transferBatches.map((t) => t.id);
  const { data: sourcesData } = transferIds.length
    ? await supabase.from("bank_transfer_sources").select("transfer_batch_id, payroll_batch_id").in("transfer_batch_id", transferIds)
    : { data: [] };
  const sources = (sourcesData ?? []) as { transfer_batch_id: string; payroll_batch_id: string }[];

  const payrollBatchIds = [...new Set(sources.map((s) => s.payroll_batch_id))];
  const { data: payrollBatchesData } = payrollBatchIds.length
    ? await supabase.from("payroll_batches").select("id, period_id, status, review_note, submitted_at, created_at, updated_at").in("id", payrollBatchIds)
    : { data: [] };
  const payrollBatchById = new Map(((payrollBatchesData ?? []) as PayrollBatch[]).map((b) => [b.id, b]));

  const periodIds = [...new Set(((payrollBatchesData ?? []) as PayrollBatch[]).map((b) => b.period_id))];
  const { data: periodsData } = periodIds.length
    ? await supabase.from("payroll_periods").select("id, agency_id, period_start, period_end").in("id", periodIds)
    : { data: [] };
  const periodById = new Map(((periodsData ?? []) as PayrollPeriod[]).map((p) => [p.id, p]));

  const agencyIds = [...new Set(((periodsData ?? []) as PayrollPeriod[]).map((p) => p.agency_id))];
  const { data: agenciesData } = agencyIds.length
    ? await supabase.from("agencies").select("id, name, code").in("id", agencyIds)
    : { data: [] };
  const agencyById = new Map(((agenciesData ?? []) as Agency[]).map((a) => [a.id, a]));

  const agencyLabelsByTransfer = new Map<string, string[]>();
  for (const s of sources) {
    const pb = payrollBatchById.get(s.payroll_batch_id);
    const period = pb ? periodById.get(pb.period_id) : null;
    const agency = period ? agencyById.get(period.agency_id) : null;
    if (!agency) continue;
    const list = agencyLabelsByTransfer.get(s.transfer_batch_id) ?? [];
    list.push(agency.code);
    agencyLabelsByTransfer.set(s.transfer_batch_id, list);
  }

  const grandTotal = transferBatches.reduce((s, t) => s + t.total_amount, 0);

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            การเงิน
          </div>
          <strong>สรุปรายการโอนเงินทั้งหมด</strong>
        </div>
        <Link href="/finance" className="btn">
          ← กลับหน้าแรก
        </Link>
      </div>

      <div className="page">
        {transferBatches.length === 0 && <p style={{ color: "var(--muted)" }}>ยังไม่มีรายการโอนเงิน</p>}

        {transferBatches.length > 0 && (
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 18 }}>
            รวมทั้งหมด {transferBatches.length} รายการโอน · ยอดรวม {grandTotal.toLocaleString()} บาท
          </div>
        )}

        {transferBatches.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>วันที่โอน</th>
                  <th>เลขที่เช็ค</th>
                  <th>รหัสบริษัท</th>
                  <th>หน่วยงานที่รวมอยู่</th>
                  <th>จำนวนราย</th>
                  <th>ยอดรวม</th>
                  <th>ดาวน์โหลด</th>
                </tr>
              </thead>
              <tbody>
                {transferBatches.map((t) => (
                  <tr key={t.id}>
                    <td>{t.transfer_date}</td>
                    <td>{t.check_no ?? "—"}</td>
                    <td>{t.company_code ?? "—"}</td>
                    <td>{(agencyLabelsByTransfer.get(t.id) ?? []).join(", ") || "—"}</td>
                    <td>{t.total_count}</td>
                    <td>{t.total_amount.toLocaleString()} บาท</td>
                    <td>
                      <a className="btn" href={`/api/bank-export/${t.id}`}>
                        ไฟล์โอนเงิน (.txt)
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
