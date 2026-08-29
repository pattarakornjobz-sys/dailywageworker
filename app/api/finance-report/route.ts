import path from "path";
import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, effectiveStatus } from "@/lib/statusLabels";
import type { Agency, DetailWithEmployee, Employee, PayrollBatch, PayrollDetail, PayrollPeriod } from "@/lib/types";

export const runtime = "nodejs";

const VISIBLE_STATUSES = ["submitted_to_central", "finance_received", "transferring", "paid", "rejected"];

const FONT_DIR = path.join(process.cwd(), "lib", "fonts");

// GET /api/finance-report — สร้าง PDF สรุปรายละเอียดการจ่ายเงินทั้งหมด (ทุกหน่วยงาน ทุกรายการที่ส่งถึงการเงินแล้ว)
// ใช้ session cookie + RLS เหมือน route อื่น ๆ ไม่ใช้ service_role key
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profileData } = await supabase.from("profiles").select("id, full_name, role").eq("id", user.id).single();
  if (!profileData || profileData.role !== "finance_officer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: batchesData } = await supabase
    .from("payroll_batches")
    .select("id, period_id, status, review_note, submitted_at, created_at, updated_at")
    .in("status", VISIBLE_STATUSES)
    .order("submitted_at", { ascending: true });
  const batches = (batchesData ?? []) as PayrollBatch[];

  const periodIds = batches.map((b) => b.period_id);
  const { data: periodsData } = periodIds.length
    ? await supabase.from("payroll_periods").select("id, agency_id, period_start, period_end").in("id", periodIds)
    : { data: [] };
  const periodById = new Map(((periodsData ?? []) as PayrollPeriod[]).map((p) => [p.id, p]));

  const agencyIds = [...new Set(((periodsData ?? []) as PayrollPeriod[]).map((p) => p.agency_id))];
  const { data: agenciesData } = agencyIds.length
    ? await supabase.from("agencies").select("id, name, code").in("id", agencyIds).order("code")
    : { data: [] };
  const agencyById = new Map(((agenciesData ?? []) as Agency[]).map((a) => [a.id, a]));

  const { data: detailsData } = periodIds.length
    ? await supabase
        .from("payroll_details")
        .select("id, period_id, employee_id, days_full, days_half, daily_rate, total_amount, employee_ack_at")
        .in("period_id", periodIds)
    : { data: [] };
  const details = (detailsData ?? []) as PayrollDetail[];

  const employeeIds = [...new Set(details.map((d) => d.employee_id))];
  const { data: employeesData } = employeeIds.length
    ? await supabase
        .from("employees")
        .select("id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status")
        .in("id", employeeIds)
    : { data: [] };
  const employeeById = new Map(((employeesData ?? []) as Employee[]).map((e) => [e.id, e]));

  const detailsByPeriod = new Map<string, DetailWithEmployee[]>();
  for (const d of details) {
    const emp = employeeById.get(d.employee_id);
    if (!emp) continue;
    const list = detailsByPeriod.get(d.period_id) ?? [];
    list.push({ ...d, employee: emp });
    detailsByPeriod.set(d.period_id, list);
  }

  // จัดกลุ่ม batch ตามหน่วยงาน เรียงตามรหัสหน่วยงาน
  const batchesByAgency = new Map<string, { agency: Agency; rows: (PayrollBatch & { period: PayrollPeriod })[] }>();
  for (const batch of batches) {
    const period = periodById.get(batch.period_id);
    if (!period) continue;
    const agency = agencyById.get(period.agency_id);
    if (!agency) continue;
    const entry = batchesByAgency.get(agency.id) ?? { agency, rows: [] };
    entry.rows.push({ ...batch, period });
    batchesByAgency.set(agency.id, entry);
  }
  const groups = Array.from(batchesByAgency.values()).sort((a, b) => a.agency.code.localeCompare(b.agency.code));

  const pdfBuffer = await buildReportPdf(groups, detailsByPeriod, profileData.full_name as string);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="finance-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}

function buildReportPdf(
  groups: { agency: Agency; rows: (PayrollBatch & { period: PayrollPeriod })[] }[],
  detailsByPeriod: Map<string, DetailWithEmployee[]>,
  generatedBy: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Sarabun", path.join(FONT_DIR, "Garuda.ttf"));
    doc.registerFont("Sarabun-Bold", path.join(FONT_DIR, "Garuda-Bold.ttf"));
    doc.font("Sarabun");

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colX = { code: 40, name: 90, days: 300, amount: 350, account: 420 };

    doc.font("Sarabun-Bold").fontSize(16).text("รายงานสรุปรายละเอียดการจ่ายเงินเดือนลูกจ้างรายวัน", { align: "center" });
    doc.moveDown(0.3);
    doc
      .font("Sarabun")
      .fontSize(10)
      .fillColor("#555")
      .text(`พิมพ์โดย ${generatedBy} · วันที่พิมพ์ ${new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}`, {
        align: "center",
      });
    doc.fillColor("#000");
    doc.moveDown(1);

    let grandTotal = 0;
    let grandCount = 0;

    if (groups.length === 0) {
      doc.font("Sarabun").fontSize(12).text("ยังไม่มีรายการที่ส่งถึงการเงิน", { align: "center" });
    }

    for (const { agency, rows } of groups) {
      for (const batch of rows) {
        const periodRows = detailsByPeriod.get(batch.period.id) ?? [];
        if (periodRows.length === 0) continue;

        ensureSpace(doc, 90);

        doc.font("Sarabun-Bold").fontSize(12.5).text(`${agency.code} — ${agency.name}`);
        doc
          .font("Sarabun")
          .fontSize(10)
          .fillColor("#555")
          .text(
            `รอบจ่าย ${batch.period.period_start} – ${batch.period.period_end}   ·   สถานะ: ${
              STATUS_LABEL[effectiveStatus(batch.status, null)]
            }`
          );
        doc.fillColor("#000");
        doc.moveDown(0.4);

        const tableTop = doc.y;
        doc.font("Sarabun-Bold").fontSize(9.5);
        doc.text("รหัส", colX.code, tableTop, { width: 45 });
        doc.text("ชื่อ–นามสกุล", colX.name, tableTop, { width: 200 });
        doc.text("วันทำงาน", colX.days, tableTop, { width: 45, align: "right" });
        doc.text("จำนวนเงิน", colX.amount, tableTop, { width: 65, align: "right" });
        doc.text("เลขบัญชี", colX.account, tableTop, { width: 120 });
        doc.moveDown(0.3);
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor("#ccc")
          .stroke();
        doc.moveDown(0.2);

        let subtotal = 0;
        doc.font("Sarabun").fontSize(9.5);
        for (const r of periodRows) {
          ensureSpace(doc, 16);
          const y = doc.y;
          doc.text(r.employee.fingerprint_no, colX.code, y, { width: 45 });
          doc.text(`${r.employee.prefix} ${r.employee.first_name} ${r.employee.last_name}`.trim(), colX.name, y, { width: 200 });
          doc.text(String(r.days_full + r.days_half), colX.days, y, { width: 45, align: "right" });
          doc.text(r.total_amount.toLocaleString(), colX.amount, y, { width: 65, align: "right" });
          doc.text(r.employee.bank_account_no ?? "ไม่มีเลขบัญชี", colX.account, y, { width: 120 });
          doc.moveDown(0.35);
          subtotal += r.total_amount;
        }

        grandTotal += subtotal;
        grandCount += periodRows.length;

        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor("#ccc")
          .stroke();
        doc.moveDown(0.2);
        doc.font("Sarabun-Bold").fontSize(9.5).text(`รวม ${periodRows.length} คน — ${subtotal.toLocaleString()} บาท`, colX.amount - 60, doc.y, {
          width: pageWidth - (colX.amount - 60 - doc.page.margins.left),
          align: "right",
        });
        doc.moveDown(1);
      }
    }

    if (groups.length > 0) {
      ensureSpace(doc, 40);
      doc.moveDown(0.3);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor("#000")
        .stroke();
      doc.moveDown(0.3);
      doc.font("Sarabun-Bold").fontSize(12).text(`รวมทั้งหมด ${grandCount} รายการ — ${grandTotal.toLocaleString()} บาท`, {
        align: "right",
      });
    }

    // เลขหน้า — เขียนใน "ระยะขอบล่าง" ของหน้า ต้องลด margin.bottom ลงชั่วคราวก่อนเขียน
    // ไม่งั้น pdfkit จะเข้าใจว่าพื้นที่ไม่พอและขึ้นหน้าใหม่ว่าง ๆ ต่อท้ายให้เองทุกครั้งที่เขียน
    const pageRange = doc.bufferedPageRange();
    const originalBottomMargin = doc.page.margins.bottom;
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .font("Sarabun")
        .fontSize(8.5)
        .fillColor("#888")
        .text(`หน้า ${i + 1} / ${pageRange.count}`, doc.page.margins.left, doc.page.height - 30, {
          width: pageWidth,
          align: "center",
          lineBreak: false,
        });
      doc.page.margins.bottom = originalBottomMargin;
    }

    doc.end();
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}
