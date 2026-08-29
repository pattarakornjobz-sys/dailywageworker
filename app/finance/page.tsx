import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Agency, BankCompanyCode, PayrollBatch, PayrollDetail, PayrollPeriod, Profile } from "@/lib/types";
import FinanceBoard from "./FinanceBoard";
import PdfReportPicker from "./PdfReportPicker";
import LogoutButton from "@/components/LogoutButton";

const VISIBLE_STATUSES = ["submitted_to_central", "finance_received", "transferring", "paid", "rejected"];

export default async function FinanceHome() {
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

  const { data: batchesData } = await supabase
    .from("payroll_batches")
    .select("id, period_id, status, review_note, submitted_at, created_at, updated_at")
    .in("status", VISIBLE_STATUSES)
    .order("submitted_at", { ascending: false });
  const batches = (batchesData ?? []) as PayrollBatch[];

  const periodIds = batches.map((b) => b.period_id);
  const { data: periodsData } = periodIds.length
    ? await supabase.from("payroll_periods").select("id, agency_id, period_start, period_end").in("id", periodIds)
    : { data: [] };
  const periodById = new Map(((periodsData ?? []) as PayrollPeriod[]).map((p) => [p.id, p]));

  const agencyIds = [...new Set(((periodsData ?? []) as PayrollPeriod[]).map((p) => p.agency_id))];
  const { data: agenciesData } = agencyIds.length
    ? await supabase.from("agencies").select("id, name, code").in("id", agencyIds).order("code")
    : { data: [] };
  const agencyById = new Map(((agenciesData ?? []) as Agency[]).map((a) => [a.id, a]));

  // ยอดรวมต่อ batch (sum(total_amount) ของ payroll_details ในรอบนั้น)
  const { data: detailsData } = periodIds.length
    ? await supabase.from("payroll_details").select("period_id, total_amount").in("period_id", periodIds)
    : { data: [] };
  const totalByPeriod = new Map<string, number>();
  for (const d of (detailsData ?? []) as Pick<PayrollDetail, "period_id" | "total_amount">[]) {
    totalByPeriod.set(d.period_id, (totalByPeriod.get(d.period_id) ?? 0) + d.total_amount);
  }

  const { data: companyCodesData } = await supabase
    .from("bank_company_codes")
    .select("code, name, is_active")
    .eq("is_active", true)
    .order("code");
  const companyCodes = (companyCodesData ?? []) as BankCompanyCode[];

  // จัดกลุ่ม batch ตามหน่วยงาน
  const batchesByAgency = new Map<string, { agency: Agency; rows: (PayrollBatch & { period: PayrollPeriod; total: number })[] }>();
  for (const batch of batches) {
    const period = periodById.get(batch.period_id);
    if (!period) continue;
    const agency = agencyById.get(period.agency_id);
    if (!agency) continue;
    const entry = batchesByAgency.get(agency.id) ?? { agency, rows: [] };
    entry.rows.push({ ...batch, period, total: totalByPeriod.get(period.id) ?? 0 });
    batchesByAgency.set(agency.id, entry);
  }
  const groups = Array.from(batchesByAgency.values()).sort((a, b) => a.agency.code.localeCompare(b.agency.code));

  const grandTotal = batches.reduce((s, b) => s + (totalByPeriod.get(b.period_id) ?? 0), 0);

  // ช่วงรอบจ่ายที่มีให้เลือกสำหรับพิมพ์รายงาน PDF รวม — เอาเฉพาะช่วงวันที่ไม่ซ้ำกัน เรียงล่าสุดก่อน
  const rangeCounts = new Map<string, number>();
  for (const batch of batches) {
    const period = periodById.get(batch.period_id);
    if (!period) continue;
    const key = `${period.period_start}|${period.period_end}`;
    rangeCounts.set(key, (rangeCounts.get(key) ?? 0) + 1);
  }
  const reportRanges = Array.from(rangeCounts.entries())
    .map(([key, count]) => {
      const [start, end] = key.split("|");
      return { start, end, count };
    })
    .sort((a, b) => b.start.localeCompare(a.start));

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            การเงิน
          </div>
          <strong>ภาพรวมทุกหน่วยงาน — รายการรอดำเนินการ</strong>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/finance/transfers" className="btn">
            สรุปรายการโอนเงิน
          </Link>
          <PdfReportPicker ranges={reportRanges} />
          <span style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{profile.full_name}</span>
          <LogoutButton />
        </div>
      </div>

      <div className="page">
        {batches.length === 0 && <p style={{ color: "var(--muted)" }}>ยังไม่มีเรื่องส่งเข้ามา</p>}

        {batches.length > 0 && (
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 18 }}>
            รวมทั้งหมด {batches.length} รายการ · {groups.length} หน่วยงาน · ยอดรวม {grandTotal.toLocaleString()} บาท
            <span style={{ color: "var(--muted)" }}> — ติ๊กเลือกได้หลายรายการ แล้วกดรับเรื่อง/กำหนดการโอนเงินครั้งเดียว</span>
          </div>
        )}

        {groups.length > 0 && <FinanceBoard groups={groups} companyCodes={companyCodes} />}
      </div>
    </div>
  );
}
