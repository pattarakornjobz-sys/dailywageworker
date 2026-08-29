import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, agency_id")
    .eq("id", user.id)
    .single();
  const profile = data as Profile | null;

  if (!profile) {
    redirect("/login?error=no_profile");
  }

  if (profile.role === "agency_clerk") {
    redirect("/clerk");
  }
  if (profile.role === "finance_officer") {
    redirect("/finance");
  }

  // บทบาทอื่น (agency_head / central_reviewer / admin) ยังไม่มีหน้าจอในสตาร์ทเตอร์นี้
  redirect("/login?error=unsupported_role");
}
