import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL } from "@/lib/statusLabels";
import SubmitButton from "./SubmitButton";
import PrintButton from "./PrintButton";
import StatusTimeline from "@/components/StatusTimeline";
import type { Agency, DetailWithEmployee, Employee, PayrollBatch, PayrollDetail, PayrollPeriod, StatusEvent } from "@/lib/types";

export default async function ClerkBatchDetail({ params }: { params: { batchId: string } }) {
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
    .filter((r) => r.employee)
    .sort((a, b) => (a.employee.first_name > b.employee.first_name ? 1 : -1));

  const totalAmount = rows.reduce((s, r) => s + r.total_amount, 0);

  const { data: eventsData } = await supabase
    .from("payroll_status_events")
    .select("id, batch_id, from_status, to_status, actor_id, note, created_at")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });
  const events = (eventsData ?? []) as StatusEvent[];
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: actorsData } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const actorNameById = new Map(((actorsData ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const eventsWithActor: StatusEvent[] = events.map((e) => ({ ...e, actor_name: e.actor_id ? actorNameById.get(e.actor_id) : null }));

  return (
    <div>
      <div className="topbar no-print">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            สรุปจ่ายเงิน
          </div>
          <strong>
            {agency?.name} · {period.period_start} – {period.period_end}
          </strong>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <span className="btn" style={{ cursor: "default" }}>
            สถานะ: {STATUS_LABEL[batch.status]}
          </span>
        </div>
      </div>

      <div className="page">
        <div className="card">
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <h2>ใบสำคัญรับเงิน — สรุปค่าจ้างรายบุคคล</h2>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
              {agency?.name} · ระหว่างวันที่ {period.period_start} ถึง {period.period_end}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line-soft)" }}>
            <span>จำนวนลูกจ้าง: {rows.length} คน</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ–นามสกุล</th>
                <th>เต็มวัน</th>
                <th>ครึ่งวัน</th>
                <th>ค่าจ้าง/วัน</th>
                <th>จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.employee.fingerprint_no}</td>
                  <td>
                    {r.employee.prefix} {r.employee.first_name} {r.employee.last_name}
                  </td>
                  <td>{r.days_full}</td>
                  <td>{r.days_half}</td>
                  <td>{r.daily_rate.toLocaleString()}</td>
                  <td>{r.total_amount.toLocaleString()}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, background: "var(--line-soft)" }}>
                <td colSpan={5}>รวม</td>
                <td>{totalAmount.toLocaleString()} บาท</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card signature-page" style={{ marginTop: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 26 }}>
            <h2 style={{ fontSize: 16 }}>ลงลายมือชื่อรับรอง</h2>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
              {agency?.name} · ระหว่างวันที่ {period.period_start} ถึง {period.period_end} · ยอดรวม {totalAmount.toLocaleString()} บาท
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, fontSize: 12.5, textAlign: "center", color: "var(--ink-soft)" }}>
            <div>
              <div style={{ height: 60, borderBottom: "1px solid var(--line)", marginBottom: 8 }} />
              เจ้าหน้าที่ธุรการ
            </div>
            <div>
              <div style={{ height: 60, borderBottom: "1px solid var(--line)", marginBottom: 8 }} />
              หัวหน้าหน่วยงาน
            </div>
            <div>
              <div style={{ height: 60, borderBottom: "1px solid var(--line)", marginBottom: 8 }} />
              ผู้บริหารอนุมัติ
            </div>
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 10 }}>
          <PrintButton />
          <SubmitButton batchId={batch.id} currentStatus={batch.status} />
        </div>

        <StatusTimeline events={eventsWithActor} />
      </div>
    </div>
  );
}
