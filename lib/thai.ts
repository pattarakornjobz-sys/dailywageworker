// ยูทิลิตี้แปลงวันที่/ตัวเลขเป็นข้อความภาษาไทย ใช้สำหรับเอกสารราชการ (ใบสำคัญรับเงิน ฯลฯ)

const THAI_MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function toBuddhistYear(gregorianYear: number): number {
  return gregorianYear + 543;
}

// แปลงช่วงวันที่ (YYYY-MM-DD, YYYY-MM-DD) เป็นข้อความไทย เช่น "1 - 15 มิถุนายน 2569"
// หรือถ้าคนละเดือน/ปี จะขยายเต็มทั้งสองฝั่ง เช่น "28 พฤษภาคม 2569 - 3 มิถุนายน 2569"
export function formatThaiDateRange(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  if (sy === ey && sm === em) {
    return `${sd} - ${ed} ${THAI_MONTHS[sm - 1]} ${toBuddhistYear(sy)}`;
  }
  return `${sd} ${THAI_MONTHS[sm - 1]} ${toBuddhistYear(sy)} - ${ed} ${THAI_MONTHS[em - 1]} ${toBuddhistYear(ey)}`;
}

const THAI_DIGIT_WORDS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_POSITION_WORDS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function convertGroup(numStr: string): string {
  const trimmed = numStr.replace(/^0+(?=\d)/, "");
  const len = trimmed.length;
  let result = "";
  for (let i = 0; i < len; i++) {
    const digit = Number(trimmed[i]);
    const pos = len - i - 1; // 0 = หลักหน่วย, 1 = หลักสิบ, ...
    if (digit === 0) continue;
    if (pos === 0) {
      result += digit === 1 && len > 1 ? "เอ็ด" : THAI_DIGIT_WORDS[digit];
    } else if (pos === 1) {
      if (digit === 1) result += "สิบ";
      else if (digit === 2) result += "ยี่สิบ";
      else result += THAI_DIGIT_WORDS[digit] + "สิบ";
    } else {
      result += THAI_DIGIT_WORDS[digit] + THAI_POSITION_WORDS[pos];
    }
  }
  return result;
}

// แปลงจำนวนเต็ม (ไม่ติดลบ) เป็นข้อความไทย รองรับหลักล้านซ้ำ (ล้าน ล้าน ...) แบบมาตรฐาน
function thaiIntegerText(n: number): string {
  if (n === 0) return "ศูนย์";
  let numStr = String(Math.floor(n));
  const groups: string[] = [];
  while (numStr.length > 0) {
    groups.unshift(numStr.slice(-6));
    numStr = numStr.slice(0, -6);
  }
  let result = "";
  for (let i = 0; i < groups.length; i++) {
    const part = convertGroup(groups[i]);
    if (!part) continue;
    result += part + (i < groups.length - 1 ? "ล้าน" : "");
  }
  return result;
}

// แปลงจำนวนเงินเป็นข้อความไทยแบบ "...บาทถ้วน" หรือ "...บาท...สตางค์"
// เช่น thaiBahtText(856250) -> "แปดแสนห้าหมื่นหกพันสองร้อยห้าสิบบาทถ้วน"
export function thaiBahtText(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);
  let text = thaiIntegerText(baht) + "บาท";
  text += satang > 0 ? thaiIntegerText(satang) + "สตางค์" : "ถ้วน";
  return text;
}
