import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBankFile } from "@/lib/bankFile";
import type { BankTransferBatch, BankTransferItem } from "@/lib/types";

// GET /api/bank-export/[batchId] — batchId คือ id ของ bank_transfer_batches (ไม่ใช่ payroll_batches)
// ใช้ session cookie ของผู้ใช้ที่ login อยู่ — RLS ของ Supabase เป็นตัวจำกัดสิทธิ์ (เฉพาะ finance_officer
// อ่านตาราง bank_transfer_batches/items ได้) ไม่ได้ใช้ service_role key จึงไม่มีการ bypass สิทธิ์ใด ๆ
export async function GET(_req: Request, { params }: { params: { batchId: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: transferBatchData, error: tbError } = await supabase
    .from("bank_transfer_batches")
    .select("id, transfer_date, total_amount, total_count, check_no, company_code, company_name, file_url, generated_at")
    .eq("id", params.batchId)
    .single();

  if (tbError || !transferBatchData) {
    return NextResponse.json({ error: "ไม่พบรายการโอนเงินนี้ หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }
  const transferBatch = transferBatchData as BankTransferBatch;

  if (!transferBatch.company_code) {
    return NextResponse.json({ error: "รายการนี้ยังไม่ได้ระบุรหัสบริษัท" }, { status: 400 });
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from("bank_transfer_items")
    .select("id, transfer_batch_id, employee_id, bank_name, bank_branch, account_no, account_name, amount, ref_no")
    .eq("transfer_batch_id", transferBatch.id);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  const items = (itemsData ?? []) as BankTransferItem[];

  if (items.length === 0) {
    return NextResponse.json({ error: "รายการโอนนี้ยังไม่มีรายชื่อผู้รับเงิน" }, { status: 400 });
  }

  let fileText: string;
  try {
    fileText = buildBankFile(
      transferBatch.company_code,
      transferBatch.transfer_date,
      items.map((it) => ({ accountNo: it.account_no, amountBaht: it.amount })),
      transferBatch.company_name ?? "SUPPORT FOUNDATION"
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างไฟล์ไม่สำเร็จ" }, { status: 400 });
  }

  return new NextResponse(fileText, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${transferBatch.company_code}.txt"`,
    },
  });
}
