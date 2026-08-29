import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Agency, Profile } from "@/lib/types";
import ClerkSidebar from "./ClerkSidebar";

// ธุรการต้นสังกัด 1 บัญชี ดูแลได้ทุกหน่วยงาน — sidebar นี้ใช้สลับแผนกที่กำลังทำงานอยู่
export default async function ClerkLayout({ children }: { children: React.ReactNode }) {
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

  const { data: agenciesData } = await supabase.from("agencies").select("id, name, code").order("code");
  const agencies = (agenciesData ?? []) as Agency[];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <ClerkSidebar agencies={agencies} fullName={profile.full_name} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
