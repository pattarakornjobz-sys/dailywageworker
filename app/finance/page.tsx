import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_COLOR, effectiveStatus } from "@/lib/statusLabels";
import type { Agency, PayrollBatch, PayrollPeriod, Profile } from "@/lib/types";

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
    ? await supabase.from("agencies").select("id, name, code").in("id", agencyIds)
    : { data: [] };
  const agencyById = new Map(((agenciesData ?? []) as Agency[]).map((a) => [a.id, a]));

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            การเงิน
          </div>
          <strong>รายการรอดำเนินการ</strong>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{profile.full_name}</div>
      </div>

      <div className="page">
        {batches.length === 0 && <p style={{ color: "var(--muted)" }}>ยังไม่มีเรื่องส่งเข้ามา</p>}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>หน่วยงาน</th>
                <th>ช่วงรอบจ่าย</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const period = periodById.get(batch.period_id);
                const agency = period ? agencyById.get(period.agency_id) : undefined;
                const status = effectiveStatus(batch.status, null);
                return (
                  <tr key={batch.id}>
                    <td>{agency?.name ?? "-"}</td>
                    <td>
                      {period?.period_start} – {period?.period_end}
                    </td>
                    <td>
                      <span className="pill" style={{ background: "#0000", color: STATUS_COLOR[status] }}>
                        ● {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td>
                      <Link href={`/finance/${batch.id}`} className="btn">
                        เปิดเรื่อง →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
