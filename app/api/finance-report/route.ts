import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDateRange } from "@/lib/thai";
import { buildFinanceReportPdf, type ReportRow } from "@/lib/financeReportPdf";
import type { Agency, Employee, PayrollBatch, PayrollDetail, PayrollPeriod } from "@/lib/types";

export const runtime = "nodejs";

const VISIBLE_STATUSES = ["submitted_to_central", "finance_received", "transferring", "paid", "rejected"];

// GET /api/finance-report?start=YYYY-MM-DD&end=YYYY-MM-DD
// สร้าง PDF "ใบสำคัญรับเงิน" รวมทุกหน่วยงานของรอบจ่ายที่เลือก — 2 ชุดในไฟล์เดียว
// ชุดที่ 1: มีจำนวนเงิน ให้เจ้าหน้าที่การเงินเซ็นรับรองว่าจ่ายจริง
// ชุดที่ 2: มีช่องลายมือชื่อผู้รับเงิน ให้ลูกจ้างเซ็นรับเงินเป็นหลักฐาน
// ใช้ session cookie + RLS เหมือน route อื่น ๆ ไม่ใช้ service_role key
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profileData } = await supabase.from("profiles").select("id, full_name, role").eq("id", user.id).single();
  if (!profileData || profileData.role !== "finance_officer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filterStart = searchParams.get("start");
  const filterEnd = searchParams.get("end");

  const { data: batchesData } = await supabase
    .from("payroll_batches")
    .select("id, period_id, status, review_note, submitted_at, created_at, updated_at")
    .in("status", VISIBLE_STATUSES)
    .order("submitted_at", { ascending: true });
  let batches = (batchesData ?? []) as PayrollBatch[];

  const periodIds = batches.map((b) => b.period_id);
  const { data: periodsData } = periodIds.length
    ? await supabase.from("payroll_periods").select("id, agency_id, period_start, period_end").in("id", periodIds)
    : { data: [] };
  const periodById = new Map(((periodsData ?? []) as PayrollPeriod[]).map((p) => [p.id, p]));

  // จำกัดเฉพาะรอบจ่ายที่เลือก (วันที่เริ่ม/สิ้นสุดตรงกันเป๊ะ) — ถ้าไม่ส่งมาก็เอารอบล่าสุด
  if (!filterStart || !filterEnd) {
    const latest = ((periodsData ?? []) as PayrollPeriod[]).sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
    if (latest) {
      batches = batches.filter((b) => periodById.get(b.period_id)?.period_start === latest.period_start && periodById.get(b.period_id)?.period_end === latest.period_end);
    }
  } else {
    batches = batches.filter((b) => {
      const p = periodById.get(b.period_id);
      return p && p.period_start === filterStart && p.period_end === filterEnd;
    });
  }

  const scopedPeriodIds = batches.map((b) => b.period_id);
  const agencyIds = [...new Set(scopedPeriodIds.map((id) => periodById.get(id)?.agency_id).filter(Boolean))] as string[];
  const { data: agenciesData } = agencyIds.length
    ? await supabase.from("agencies").select("id, name, code").in("id", agencyIds).order("code")
    : { data: [] };
  const agencyById = new Map(((agenciesData ?? []) as Agency[]).map((a) => [a.id, a]));

  const { data: detailsData } = scopedPeriodIds.length
    ? await supabase
        .from("payroll_details")
        .select("id, period_id, employee_id, days_full, days_half, daily_rate, total_amount, employee_ack_at")
        .in("period_id", scopedPeriodIds)
    : { data: [] };
  const details = (detailsData ?? []) as PayrollDetail[];

  const employeeIds = [...new Set(details.map((d) => d.employee_id))];
  const { data: employeesData } = employeeIds.length
    ? await supabase
        .from("employees")
        .select("id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status")
        .in("id", employeeIds)
    : { data: [] };
  const employeeById = new Map(((employeesData ?? []) as Employee[]).map((e) => [e.id, e]));

  // เช็คว่าลูกจ้างแต่ละคน เคยมีรอบจ่ายมาก่อนรอบนี้ไหม (ใช้ตัดสิน "ใหม่") — ดูจากทุกหน่วยงานที่เกี่ยวข้อง ไม่จำกัดสถานะ batch
  const { data: allAgencyPeriodsData } = agencyIds.length
    ? await supabase.from("payroll_periods").select("id, agency_id, period_start, period_end").in("agency_id", agencyIds)
    : { data: [] };
  const allPeriods = (allAgencyPeriodsData ?? []) as PayrollPeriod[];
  const allPeriodIds = allPeriods.map((p) => p.id);
  const { data: allDetailsData } = allPeriodIds.length
    ? await supabase.from("payroll_details").select("period_id, employee_id").in("period_id", allPeriodIds)
    : { data: [] };
  const periodStartById = new Map(allPeriods.map((p) => [p.id, p.period_start]));
  const earliestPeriodStartByEmployee = new Map<string, string>();
  for (const d of (allDetailsData ?? []) as { period_id: string; employee_id: string }[]) {
    const start = periodStartById.get(d.period_id);
    if (!start) continue;
    const current = earliestPeriodStartByEmployee.get(d.employee_id);
    if (!current || start < current) earliestPeriodStartByEmployee.set(d.employee_id, start);
  }

  const detailsByPeriod = new Map<string, ReportRow[]>();
  for (const d of details) {
    const emp = employeeById.get(d.employee_id);
    if (!emp) continue;
    const period = periodById.get(d.period_id);
    const earliest = earliestPeriodStartByEmployee.get(d.employee_id);
    let remark = "";
    if (emp.status === "inactive") remark = "ออก";
    else if (period && earliest && earliest === period.period_start) remark = "ใหม่";
    const list = detailsByPeriod.get(d.period_id) ?? [];
    list.push({ ...d, employee: emp, remark });
    detailsByPeriod.set(d.period_id, list);
  }

  const batchesByAgency = new Map<string, { agency: Agency; rows: (PayrollBatch & { period: PayrollPeriod })[] }>();
  for (const batch of batches) {
    const period = periodById.get(batch.period_id);
    if (!period) continue;
    const agency = agencyById.get(period.agency_id);
    if (!agency) continue;
    const entry = batchesByAgency.get(agency.id) ?? { agency, rows: [] };
    entry.rows.push({ ...batch, period });
    batchesByAgency.set(agency.id, entry);
  }
  const groups = Array.from(batchesByAgency.values()).sort((a, b) => a.agency.code.localeCompare(b.agency.code));

  const headerRange = scopedPeriodIds.length
    ? formatThaiDateRange(periodById.get(scopedPeriodIds[0])!.period_start, periodById.get(scopedPeriodIds[0])!.period_end)
    : "";

  const pdfBuffer = await buildFinanceReportPdf(groups, detailsByPeriod, headerRange);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="finance-report-${(filterStart ?? "").replaceAll("-", "") || "latest"}.pdf"`,
    },
  });
}
