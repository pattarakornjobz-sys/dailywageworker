/**
 * สร้างไฟล์โอนเงิน fixed-width text — ถอดรูปแบบจากไฟล์ตัวอย่าง 067026.txt ที่ผู้ใช้ส่งมา
 * (ทดสอบ round-trip กับไฟล์ตัวอย่างจริงแล้วว่าตรงกันทุกไบต์ — ดู scripts/bank_file_format.py ในแพ็กเกจ DB)
 *
 * โครงสร้างที่ยืนยันแล้ว:
 *   Header (70 ตัวอักษร): 9 ช่องว่าง + 'M' + รหัสบริษัท 6 หลัก + ชื่อบริษัท 30 ตัว (ชิดซ้าย) +
 *                          'DA' + วันที่โอน DDMMYY + ส่วนท้าย 16 ตัว (คงที่ ยังไม่ยืนยันความหมาย)
 *   Detail (26 ตัวอักษรต่อรายการ): เลขบัญชี 10 หลัก + วันที่โอน DDMMYY + จำนวนเงิน 10 หลัก (หน่วยสตางค์)
 *
 * คำเตือน: ส่วนท้ายของ header (STATIC_HEADER_TAIL) คัดลอกมาจากไฟล์ตัวอย่างไฟล์เดียว (11 รายการ)
 * ยังไม่มีไฟล์เทียบที่จำนวนรายการ/ยอดต่างกันเพื่อยืนยันว่าค่านี้คงที่จริงหรือเปลี่ยนตามยอด/จำนวนรายการ
 * ควรขอไฟล์ตัวอย่างเพิ่มจากธนาคาร/ฝ่ายที่เคยส่งไฟล์นี้ก่อนใช้ตัดโอนเงินจริง
 */

const STATIC_HEADER_TAIL = "000110023018200I";

export interface BankFileItem {
  accountNo: string;
  amountBaht: number;
}

function assertCompanyCode(code: string) {
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`company code ต้องเป็นตัวเลข 6 หลัก ได้รับ: ${code}`);
  }
}

function assertDdmmyy(d: string) {
  if (!/^\d{6}$/.test(d)) {
    throw new Error(`transfer date ต้องเป็น DDMMYY 6 หลัก ได้รับ: ${d}`);
  }
}

export function toDdmmyy(isoDate: string): string {
  // isoDate: 'YYYY-MM-DD' -> 'DDMMYY' (ปี ค.ศ. 2 หลักท้าย)
  const [y, m, d] = isoDate.split("-");
  return `${d}${m}${y.slice(2)}`;
}

export function buildHeader(
  companyCode: string,
  transferDateDdmmyy: string,
  companyName = "SUPPORT FOUNDATION"
): string {
  assertCompanyCode(companyCode);
  assertDdmmyy(transferDateDdmmyy);
  const nameField = companyName.toUpperCase().slice(0, 30).padEnd(30, " ");
  return " ".repeat(9) + "M" + companyCode + nameField + "DA" + transferDateDdmmyy + STATIC_HEADER_TAIL;
}

export function buildDetail(accountNo: string, transferDateDdmmyy: string, amountBaht: number): string {
  const digits = accountNo.replace(/\D/g, "").slice(-10).padStart(10, "0");
  const amountSatang = Math.round(amountBaht * 100);
  if (amountSatang < 0 || amountSatang > 9_999_999_999) {
    throw new Error(`amount เกินขอบเขตของช่อง 10 หลัก: ${amountBaht}`);
  }
  const amountField = String(amountSatang).padStart(10, "0");
  return digits + transferDateDdmmyy + amountField;
}

export function buildBankFile(
  companyCode: string,
  transferDateIso: string,
  items: BankFileItem[],
  companyName = "SUPPORT FOUNDATION"
): string {
  const ddmmyy = toDdmmyy(transferDateIso);
  const lines = [buildHeader(companyCode, ddmmyy, companyName)];
  for (const item of items) {
    lines.push(buildDetail(item.accountNo, ddmmyy, item.amountBaht));
  }
  return lines.join("\n") + "\n";
}
