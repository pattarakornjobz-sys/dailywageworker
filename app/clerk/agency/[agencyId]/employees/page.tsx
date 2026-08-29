import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Agency, Employee } from "@/lib/types";
import EmployeeManager from "./EmployeeManager";

export default async function EmployeesPage({ params }: { params: { agencyId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: agencyData } = await supabase.from("agencies").select("id, name, code").eq("id", params.agencyId).single();
  const agency = agencyData as Agency | null;
  if (!agency) notFound();

  const { data: employeesData } = await supabase
    .from("employees")
    .select(
      "id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status"
    )
    .eq("agency_id", agency.id)
    .order("fingerprint_no");
  const employees = (employeesData ?? []) as Employee[];

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            {agency.code} · จัดการลูกจ้าง
          </div>
          <strong>{agency.name}</strong>
        </div>
      </div>
      <div className="page">
        <EmployeeManager agencyId={agency.id} initialEmployees={employees} />
      </div>
    </div>
  );
}
