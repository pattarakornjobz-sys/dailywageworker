import path from "path";
import PDFDocument from "pdfkit";
import { thaiBahtText } from "@/lib/thai";
import type { Agency, DetailWithEmployee, PayrollBatch, PayrollPeriod } from "@/lib/types";

const FONT_DIR = path.join(process.cwd(), "lib", "fonts");

export type ReportRow = DetailWithEmployee & { remark: string };

// สร้าง PDF "ใบสำคัญรับเงิน" รวมทุกหน่วยงานของรอบจ่ายที่เลือก — 2 ชุดในไฟล์เดียว
// ชุดที่ 1: มีจำนวนเงิน ให้เจ้าหน้าที่การเงินเซ็นรับรองว่าจ่ายจริง
// ชุดที่ 2: มีช่องลายมือชื่อผู้รับเงิน ให้ลูกจ้างเซ็นรับเงินเป็นหลักฐาน
export function buildFinanceReportPdf(
  groups: { agency: Agency; rows: (PayrollBatch & { period: PayrollPeriod })[] }[],
  detailsByPeriod: Map<string, ReportRow[]>,
  headerRange: string
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
    const left = doc.page.margins.left;

    // รวมทุกแถวข้ามหน่วยงาน (เรียงตามรหัสหน่วยงาน) ไว้ล่วงหน้า จะได้รู้ยอดรวม/จำนวนคนทั้งหมด
    const allRows: { agency: Agency; rows: ReportRow[] }[] = [];
    for (const { agency, rows } of groups) {
      for (const batch of rows) {
        const periodRows = detailsByPeriod.get(batch.period.id) ?? [];
        if (periodRows.length === 0) continue;
        allRows.push({ agency, rows: periodRows });
      }
    }
    const totalCount = allRows.reduce((s, g) => s + g.rows.length, 0);
    const totalAmount = allRows.reduce((s, g) => s + g.rows.reduce((s2, r) => s2 + r.total_amount, 0), 0);

    // หมายเหตุ: ตารางนี้วาดด้วยตำแหน่ง x/y ตายตัว (ไม่ใช้ text flow ปกติของ pdfkit) เพราะต้องการให้
    // หลายคอลัมน์อยู่บรรทัดเดียวกันเป๊ะ ๆ — ทุกเซลล์จึงบังคับ lineBreak:false (ตัดไม่ให้ขึ้นบรรทัดใหม่)
    // แล้วขยับ doc.y เองด้วยความสูงแถวคงที่ แทนการพึ่ง doc.moveDown()/doc.y ที่ pdfkit set ให้อัตโนมัติ
    // (ถ้าปล่อยให้ auto จะเพี้ยนทันทีที่มีคอลัมน์ไหนข้อความยาวจนอยากขึ้นบรรทัดใหม่ — แถวจะทับกัน)

    // ===== ชุดที่ 1: มีจำนวนเงิน =====
    const ROW_H1 = 16;
    const col1 = { seq: left, code: left + 28, name: left + 76, days: left + 258, half: left + 305, rate: left + 345, amount: left + 392, remark: left + 458 };
    let seq = 1;

    drawHeader(doc, headerRange);

    if (allRows.length === 0) {
      doc.font("Sarabun").fontSize(12).text("ยังไม่มีรายการที่ส่งถึงการเงินสำหรับรอบนี้", { align: "center" });
    }

    for (const { agency, rows } of allRows) {
      ensureSpace(doc, 90);
      doc.font("Sarabun-Bold").fontSize(12).text(`${agency.code} — ${agency.name}`, left, doc.y, { lineBreak: false });
      doc.y += 18;

      drawTableHeader1(doc, col1);

      doc.font("Sarabun").fontSize(9.5);
      for (const r of rows) {
        ensureSpace(doc, ROW_H1 + 4);
        const y = doc.y;
        doc.text(String(seq), col1.seq, y, { width: 26, lineBreak: false });
        doc.text(r.employee.fingerprint_no, col1.code, y, { width: 46, lineBreak: false });
        doc.text(`${r.employee.prefix} ${r.employee.first_name} ${r.employee.last_name}`.trim(), col1.name, y, {
          width: 180,
          lineBreak: false,
          ellipsis: true,
        });
        doc.text(String(r.days_full), col1.days, y, { width: 44, align: "right", lineBreak: false });
        doc.text(String(r.days_half), col1.half, y, { width: 38, align: "right", lineBreak: false });
        doc.text(r.daily_rate.toLocaleString(), col1.rate, y, { width: 44, align: "right", lineBreak: false });
        doc.text(r.total_amount.toLocaleString(), col1.amount, y, { width: 63, align: "right", lineBreak: false });
        doc.text(r.remark, col1.remark, y, { width: 57, lineBreak: false });
        doc.y = y + ROW_H1;
        seq++;
      }
      doc.y += 10;
    }

    if (allRows.length > 0) {
      ensureSpace(doc, 100);
      hr(doc, left, pageWidth);
      doc.y += 8;
      doc.font("Sarabun-Bold").fontSize(11).text(`รวมทั้งหมด จำนวน ${totalCount} คน เป็นเงิน ${totalAmount.toLocaleString()} บาท`, left, doc.y);
      doc.y += 4;
      doc.font("Sarabun").fontSize(10.5).text(`( ${thaiBahtText(totalAmount)} )`, left, doc.y, { width: pageWidth });
      drawSignatureBlock(doc, pageWidth, left);
    }

    // ===== ชุดที่ 2: หน้าใหม่ — รายชื่อให้ลงลายมือชื่อรับเงิน =====
    doc.addPage();
    seq = 1;
    const ROW_H2 = 24;
    const col2 = { seq: left, code: left + 32, name: left + 84, sign: left + 320 };

    drawHeader(doc, headerRange);

    for (const { agency, rows } of allRows) {
      ensureSpace(doc, 90);
      doc.font("Sarabun-Bold").fontSize(12).text(`${agency.code} — ${agency.name}`, left, doc.y, { lineBreak: false });
      doc.y += 18;

      drawTableHeader2(doc, col2, pageWidth, left);

      doc.font("Sarabun").fontSize(9.5);
      for (const r of rows) {
        ensureSpace(doc, ROW_H2 + 4);
        const y = doc.y;
        doc.text(String(seq), col2.seq, y, { width: 30, lineBreak: false });
        doc.text(r.employee.fingerprint_no, col2.code, y, { width: 50, lineBreak: false });
        doc.text(`${r.employee.prefix} ${r.employee.first_name} ${r.employee.last_name}`.trim(), col2.name, y, {
          width: 230,
          lineBreak: false,
          ellipsis: true,
        });
        doc
          .moveTo(col2.sign, y + 16)
          .lineTo(left + pageWidth, y + 16)
          .strokeColor("#ccc")
          .stroke();
        doc.y = y + ROW_H2;
        seq++;
      }
      doc.y += 10;
    }

    if (allRows.length > 0) {
      ensureSpace(doc, 100);
      hr(doc, left, pageWidth);
      doc.y += 8;
      doc.font("Sarabun-Bold").fontSize(11).text(`รวมทั้งหมด จำนวน ${totalCount} คน`, left, doc.y);
      drawSignatureBlock(doc, pageWidth, left);
    }

    // เลขหน้า — ต้องลด margin.bottom ลงชั่วคราวก่อนเขียนตรงขอบล่างสุด ไม่งั้น pdfkit จะขึ้นหน้าใหม่ว่าง ๆ ให้เอง
    const pageRange = doc.bufferedPageRange();
    const originalBottomMargin = doc.page.margins.bottom;
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc
        .font("Sarabun")
        .fontSize(8.5)
        .fillColor("#888")
        .text(`หน้า ${i + 1} / ${pageRange.count}`, left, doc.page.height - 30, { width: pageWidth, align: "center", lineBreak: false });
      doc.page.margins.bottom = originalBottomMargin;
    }

    doc.end();
  });
}

function drawHeader(doc: PDFKit.PDFDocument, headerRange: string) {
  doc.font("Sarabun-Bold").fontSize(16).text("ใบสำคัญรับเงิน", { align: "center" });
  doc.moveDown(0.15);
  doc.font("Sarabun").fontSize(12.5).text("สรุปค่าจ้างรายบุคคล", { align: "center" });
  doc.moveDown(0.1);
  doc.fontSize(11).fillColor("#555").text(`ระหว่างวันที่ ${headerRange}`, { align: "center" });
  doc.fillColor("#000");
  doc.moveDown(0.8);
}

function drawTableHeader1(doc: PDFKit.PDFDocument, col: Record<string, number>) {
  const y = doc.y;
  doc.font("Sarabun-Bold").fontSize(9.5);
  doc.text("ลำดับ", col.seq, y, { width: 26, lineBreak: false });
  doc.text("รหัส", col.code, y, { width: 46, lineBreak: false });
  doc.text("ชื่อ–นามสกุล", col.name, y, { width: 180, lineBreak: false });
  doc.text("เต็มวัน", col.days, y, { width: 44, align: "right", lineBreak: false });
  doc.text("ครึ่งวัน", col.half, y, { width: 38, align: "right", lineBreak: false });
  doc.text("ค่าจ้าง", col.rate, y, { width: 44, align: "right", lineBreak: false });
  doc.text("จำนวนเงิน", col.amount, y, { width: 63, align: "right", lineBreak: false });
  doc.text("หมายเหตุ", col.remark, y, { width: 57, lineBreak: false });
  doc.y = y + 14;
  hr(doc, doc.page.margins.left, doc.page.width - doc.page.margins.left - doc.page.margins.right);
  doc.y += 6;
}

function drawTableHeader2(doc: PDFKit.PDFDocument, col: Record<string, number>, pageWidth: number, left: number) {
  const y = doc.y;
  doc.font("Sarabun-Bold").fontSize(9.5);
  doc.text("ลำดับ", col.seq, y, { width: 30, lineBreak: false });
  doc.text("รหัส", col.code, y, { width: 50, lineBreak: false });
  doc.text("ชื่อ–นามสกุล", col.name, y, { width: 230, lineBreak: false });
  doc.text("ลายมือชื่อผู้รับเงิน", col.sign, y, { width: left + pageWidth - col.sign, lineBreak: false });
  doc.y = y + 14;
  hr(doc, left, pageWidth);
  doc.y += 6;
}

function drawSignatureBlock(doc: PDFKit.PDFDocument, pageWidth: number, left: number) {
  ensureSpace(doc, 110);
  doc.y += 26;
  doc.font("Sarabun").fontSize(11).text("ขอรับรองว่าได้จ่ายเงินไปตามใบสำคัญฉบับนี้จริง", left, doc.y, { width: pageWidth, align: "center" });
  doc.y += 46;
  doc.text("( ...................................................... )", left, doc.y, { width: pageWidth, align: "center" });
  doc.y += 18;
  doc.text("เจ้าหน้าที่ส่วนงบประมาณโครงการฯ", left, doc.y, { width: pageWidth, align: "center" });
}

function hr(doc: PDFKit.PDFDocument, left: number, width: number) {
  doc
    .moveTo(left, doc.y)
    .lineTo(left + width, doc.y)
    .strokeColor("#ccc")
    .stroke();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}
