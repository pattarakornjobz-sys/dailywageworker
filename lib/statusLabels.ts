import type { PayrollStatus } from "@/lib/types";

// ข้อความสถานะที่แสดงบนหน้าจอ ตาม workflow 2 บทบาท (ธุรการต้นสังกัด + การเงิน)
// การตรวจสอบของ "A1" และการเซ็นอนุมัติของผู้บริหารทำเป็นเอกสารกระดาษนอกระบบ
export const STATUS_LABEL: Record<PayrollStatus, string> = {
  draft: "ธุรการกำลังจัดทำ",
  employee_acknowledged: "ลูกจ้างเซ็นรับทราบครบแล้ว",
  agency_approved: "หัวหน้าหน่วยงานอนุมัติแล้ว",
  submitted_to_central: "ส่งเรื่องเข้า A1 แล้ว",
  rejected: "ตีกลับ — รอธุรการแก้ไข",
  central_approved: "ส่วนกลางอนุมัติแล้ว",
  finance_received: "การเงินรับเรื่องแล้ว รอตรวจสอบ",
  transferring: "กำลังดำเนินการโอนเงิน",
  bank_file_generated: "สร้างไฟล์โอนเงินแล้ว",
  paid: "เสร็จสิ้น",
};

export const STATUS_COLOR: Record<PayrollStatus, string> = {
  draft: "#9C6A20",
  employee_acknowledged: "#9C6A20",
  agency_approved: "#2B6E63",
  submitted_to_central: "#2B6E63",
  rejected: "#9C3B34",
  central_approved: "#2B6E63",
  finance_received: "#2B6E63",
  transferring: "#9C6A20",
  bank_file_generated: "#2B6E63",
  paid: "#2B6E63",
};

/**
 * สถานะที่ "แสดงผล" ให้ผู้ใช้เห็น — ต่างจากสถานะจริงในฐานข้อมูลตรงจุดเดียว:
 * ถ้าอยู่ระหว่างโอนเงิน (transferring) และถึงหรือเลยวันโอนที่กำหนดแล้ว ให้ถือว่า "เสร็จสิ้น"
 * ทันทีโดยไม่ต้องรอใครมากดยืนยันในระบบ (ธนาคารตัดยอดอัตโนมัติ 7 โมงเช้าของวันที่กำหนด)
 * ฟังก์ชันนี้ไม่ได้แก้ค่าจริงในฐานข้อมูล — ใช้แสดงผลเท่านั้น การเงินยังกด "ยืนยันเสร็จสิ้น" เพื่อ
 * บันทึกสถานะจริงลง DB ได้เสมอ (เผื่อกรณีโอนไม่สำเร็จ/ธนาคารเลื่อนวัน ต้องแก้ไขด้วยมือ)
 */
export function effectiveStatus(status: PayrollStatus, transferDate: string | null): PayrollStatus {
  if (status === "transferring" && transferDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (transferDate <= today) return "paid";
  }
  return status;
}
