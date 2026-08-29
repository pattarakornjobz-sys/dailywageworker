import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, STATUS_COLOR, effectiveStatus } from "@/lib/statusLabels";
import type { Agency, PayrollPeriod, PayrollBatch } from "@/lib/types";

export default async function ClerkOverview() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agenciesData } = await supabase.from("agencies").select("id, name, code").order("code");
  const agencies = (agenciesData ?? []) as Agency[];

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

  // รวมรอบจ่ายล่าสุดต่อหน่วยงาน 1 แถว
  const latestPeriodByAgency = new Map<string, PayrollPeriod>();
  for (const p of periods) {
    const existing = latestPeriodByAgency.get(p.agency_id);
    if (!existing || p.period_start > existing.period_start) latestPeriodByAgency.set(p.agency_id, p);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            ธุรการต้นสังกัด
          </div>
          <strong>ภาพรวมทุกหน่วยงาน ({agencies.length} หน่วยงาน)</strong>
        </div>
      </div>

      <div className="page">
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>หน่วยงาน</th>
                <th>รอบจ่ายล่าสุด</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((agency) => {
                const period = latestPeriodByAgency.get(agency.id);
                const batch = period ? batchByPeriod.get(period.id) : undefined;
                const status = batch ? effectiveStatus(batch.status, null) : null;
                return (
                  <tr key={agency.id}>
                    <td>
                      <div style={{ color: "var(--muted)", fontSize: 11 }}>{agency.code}</div>
                      {agency.name}
                    </td>
                    <td>{period ? `${period.period_start} – ${period.period_end}` : <span style={{ color: "var(--muted)" }}>ยังไม่มีรอบจ่าย</span>}</td>
                    <td>
                      {status && (
                        <span className="pill" style={{ background: "#0000", color: STATUS_COLOR[status] }}>
                          ● {STATUS_LABEL[status]}
                        </span>
                      )}
                    </td>
                    <td>
                      <Link href={`/clerk/agency/${agency.id}`} className="btn">
                        เปิดหน่วยงาน →
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
