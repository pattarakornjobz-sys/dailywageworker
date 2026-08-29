import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_COLOR, effectiveStatus } from "@/lib/statusLabels";
import type { Agency, PayrollPeriod, PayrollBatch } from "@/lib/types";
import NewPeriodButton from "./NewPeriodButton";

export default async function AgencyHome({ params }: { params: { agencyId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agencyData } = await supabase.from("agencies").select("id, name, code").eq("id", params.agencyId).single();
  const agency = agencyData as Agency | null;
  if (!agency) notFound();

  const { data: periodsData } = await supabase
    .from("payroll_periods")
    .select("id, agency_id, period_start, period_end")
    .eq("agency_id", agency.id)
    .order("period_start", { ascending: false });
  const periods = (periodsData ?? []) as PayrollPeriod[];

  const periodIds = periods.map((p) => p.id);
  const { data: batchesData } = periodIds.length
    ? await supabase
        .from("payroll_batches")
        .select("id, period_id, status, review_note, submitted_at, created_at, updated_at")
        .in("period_id", periodIds)
    : { data: [] };
  const batches = (batchesData ?? []) as PayrollBatch[];
  const batchByPeriod = new Map(batches.map((b) => [b.period_id, b]));

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            {agency.code}
          </div>
          <strong>{agency.name}</strong>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href={`/clerk/agency/${agency.id}/employees`} className="btn">
            จัดการลูกจ้าง
          </Link>
          <Link href={`/clerk/agency/${agency.id}/import`} className="btn">
            นำเข้าสแกนนิ้ว
          </Link>
        </div>
      </div>

      <div className="page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2>รอบจ่ายของหน่วยงาน</h2>
          <NewPeriodButton agencyId={agency.id} existingPeriods={periods} />
        </div>

        {periods.length === 0 && <p style={{ color: "var(--muted)" }}>ยังไม่มีรอบจ่ายของหน่วยงานนี้ กด "สร้างรอบจ่ายใหม่" เพื่อเริ่มต้น</p>}

        {periods.length > 0 && (
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
                  const status = batch ? effectiveStatus(batch.status, null) : null;
                  return (
                    <tr key={period.id}>
                      <td>
                        {period.period_start} – {period.period_end}
                      </td>
                      <td>
                        {status ? (
                          <span className="pill" style={{ background: "#0000", color: STATUS_COLOR[status] }}>
                            ● {STATUS_LABEL[status]}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>ยังไม่มีรายงาน</span>
                        )}
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
        )}
      </div>
    </div>
  );
}
