"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PayrollStatus } from "@/lib/types";

export default function SubmitButton({ batchId, currentStatus }: { batchId: string; currentStatus: PayrollStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = currentStatus === "draft" || currentStatus === "employee_acknowledged" || currentStatus === "rejected";

  async function handleSubmit() {
    if (!confirm("ยืนยันส่งข้อมูลเข้า A1 ใช่หรือไม่? (ต้องพิมพ์เอกสารให้ผู้บริหารเซ็นแล้วเท่านั้น)")) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("payroll_batches")
      .update({ status: "submitted_to_central", submitted_at: new Date().toISOString() })
      .eq("id", batchId);

    if (updateError) {
      setError("ส่งข้อมูลไม่สำเร็จ: " + updateError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  }

  if (!canSubmit) return null;

  return (
    <div className="no-print">
      {error && <div className="error-box">{error}</div>}
      <button className="btn primary" onClick={handleSubmit} disabled={loading}>
        {loading ? "กำลังส่ง..." : "ส่งข้อมูลเข้า A1 →"}
      </button>
    </div>
  );
}
