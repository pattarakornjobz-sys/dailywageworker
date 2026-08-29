import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Agency, PayrollPeriod } from "@/lib/types";
import ImportForm from "./ImportForm";

export default async function ImportPage({ params }: { params: { agencyId: string } }) {
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

  return (
    <div>
      <div className="topbar">
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
            {agency.code} · นำเข้าสแกนนิ้ว
          </div>
          <strong>{agency.name}</strong>
        </div>
      </div>
      <div className="page">
        <ImportForm agencyId={agency.id} periods={periods} />
      </div>
    </div>
  );
}
