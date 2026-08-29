import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_COLOR, effectiveStatus } from "@/lib/statusLabels";
import type { Agency, PayrollPeriod, PayrollBatch, Profile } from "@/lib/types";

export default async function ClerkHome() {
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
  if (!profile || profile.role !== "agency_clerk") redirect("/login?error=unsupported_role");

  const { data: agencyData } = await supabase
    .from("agencies")
    .select("id, name, code")
    .eq("id", profile.agency_id)
    .single();
  const agency = agencyData as Agency | null;

  // ดึงรอบจ่ายของหน่วยงานตัวเอง พร้อม batch (RLS กรองให้เห็นเฉพาะหน่วยงานตัวเองอยู่แล้ว)
  const { data: periodsData } = await supabase
    .from("payroll_periods")
    .select("id, agency_id, period_start, period_end")
    .order("period_start", { ascending: false });
  const periods = (periodsData ?? []) as PayrollPeriod[];

  const { data: batchesData } = await supabase
    .from("payroll_batches")
    .select("id, period_id, status, review_note, submitted_at, created_at, updated_at");
  const batches = (batchesData ?? []) as PayrollBatch[];
  const batchByPeriod = new Map(batches.map((b) => [b.period_id, b]));

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            ธุรการต้นสังกัด
          </div>
          <strong>{agency?.name ?? "-"}</strong>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{profile.full_name}</div>
      </div>

      <div className="page">
        <h2 style={{ marginBottom: 18 }}>รอบจ่ายของหน่วยงาน</h2>

        {periods.length === 0 && <p style={{ color: "var(--muted)" }}>ยังไม่มีรอบจ่ายในระบบสำหรับหน่วยงานนี้</p>}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>ช่วงรอบจ่าย</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const batch = batchByPeriod.get(period.id);
                const status = batch ? effectiveStatus(batch.status, null) : "draft";
                return (
                  <tr key={period.id}>
                    <td>
                      {period.period_start} – {period.period_end}
                    </td>
                    <td>
                      <span className="pill" style={{ background: "#0000", color: STATUS_COLOR[status] }}>
                        ● {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td>
                      {batch && (
                        <Link href={`/clerk/${batch.id}`} className="btn">
                          เปิดรายงาน →
                        </Link>
                      )}
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
