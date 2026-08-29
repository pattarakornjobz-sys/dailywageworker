import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// POST /api/import-scans — รับไฟล์ .xlsx/.xls สแกนนิ้ว แล้วนำเข้า employees (สร้างใหม่ถ้ายังไม่มี)
// + attendance_scans (upsert) จากนั้นเรียก RPC recompute_payroll_details ให้คำนวณยอดใหม่ทั้งรอบ
// ใช้ session cookie ของผู้ใช้ที่ login อยู่ — RLS จำกัดสิทธิ์ (เฉพาะ agency_clerk) ไม่ได้ใช้ service_role key

const FINGERPRINT_ALIASES = ["เลขสแกนนิ้ว", "รหัสสแกนนิ้ว", "รหัสพนักงาน", "fingerprint_no", "fingerprint"];
const PREFIX_ALIASES = ["คำนำหน้า", "prefix"];
const FIRST_NAME_ALIASES = ["ชื่อ", "first_name", "firstname"];
const LAST_NAME_ALIASES = ["นามสกุล", "สกุล", "last_name", "lastname"];
const DATE_ALIASES = ["วันที่", "date", "scan_date"];
const TIME_IN_ALIASES = ["เวลาเข้า", "เวลาเข้างาน", "time_in"];
const TIME_OUT_ALIASES = ["เวลาออก", "เวลาออกงาน", "time_out"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findKey(rowKeys: string[], aliases: string[]): string | null {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const k of rowKeys) {
    if (normalizedAliases.includes(normalizeHeader(k))) return k;
  }
  return null;
}

// แปลงค่าวันที่จาก cell — รองรับ Date object (จาก cellDates:true), เลข serial ของ Excel, หรือ string
function parseDateCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    // excel serial date (epoch 1899-12-30)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD/MM/YYYY หรือ D-M-YYYY (พ.ศ. หรือ ค.ศ. — ถ้าปี > 2400 ถือว่าเป็น พ.ศ. แล้วลบ 543)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year > 2400) year -= 543;
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// แปลงค่าเวลาจาก cell — รองรับ Date object, เลข fraction ของวัน (0-1), หรือ string "HH:MM"
function parseTimeCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const totalMinutes = Math.round(v * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const min = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return null;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "agency_clerk") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์นำเข้าข้อมูล (เฉพาะธุรการต้นสังกัด)" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const agencyId = formData.get("agencyId") as string | null;
  const periodId = formData.get("periodId") as string | null;

  if (!file || !agencyId || !periodId) {
    return NextResponse.json({ error: "ข้อมูลไม่ครบ (ต้องมีไฟล์ + agencyId + periodId)" }, { status: 400 });
  }

  let rows: Record<string, unknown>[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
  } catch (e) {
    return NextResponse.json({ error: "อ่านไฟล์ไม่สำเร็จ ตรวจสอบว่าเป็นไฟล์ .xlsx/.xls ที่ไม่เสียหาย" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "ไม่พบข้อมูลในไฟล์ (แถวว่างเปล่า)" }, { status: 400 });
  }

  const headerKeys = Object.keys(rows[0]);
  const kFingerprint = findKey(headerKeys, FINGERPRINT_ALIASES);
  const kPrefix = findKey(headerKeys, PREFIX_ALIASES);
  const kFirstName = findKey(headerKeys, FIRST_NAME_ALIASES);
  const kLastName = findKey(headerKeys, LAST_NAME_ALIASES);
  const kDate = findKey(headerKeys, DATE_ALIASES);
  const kTimeIn = findKey(headerKeys, TIME_IN_ALIASES);
  const kTimeOut = findKey(headerKeys, TIME_OUT_ALIASES);

  if (!kFingerprint || !kDate) {
    return NextResponse.json(
      {
        error: `หาคอลัมน์ "เลขสแกนนิ้ว" หรือ "วันที่" ไม่เจอในไฟล์ — คอลัมน์ที่พบ: ${headerKeys.join(", ")} (ดาวน์โหลดเทมเพลตแล้วใช้หัวตารางตามนั้น)`,
      },
      { status: 400 }
    );
  }

  type ParsedRow = {
    fingerprint_no: string;
    prefix: string;
    first_name: string;
    last_name: string;
    scan_date: string;
    time_in: string | null;
    time_out: string | null;
  };

  const parsed: ParsedRow[] = [];
  const skippedReasons: string[] = [];

  rows.forEach((row, idx) => {
    const fingerprint = String(row[kFingerprint] ?? "").trim();
    const scanDate = parseDateCell(row[kDate]);
    if (!fingerprint) {
      skippedReasons.push(`แถวที่ ${idx + 2}: ไม่มีเลขสแกนนิ้ว`);
      return;
    }
    if (!scanDate) {
      skippedReasons.push(`แถวที่ ${idx + 2}: อ่านวันที่ไม่ได้ (ค่าที่ได้: ${String(row[kDate])})`);
      return;
    }
    parsed.push({
      fingerprint_no: fingerprint,
      prefix: kPrefix ? String(row[kPrefix] ?? "").trim() : "",
      first_name: kFirstName ? String(row[kFirstName] ?? "").trim() : "",
      last_name: kLastName ? String(row[kLastName] ?? "").trim() : "",
      scan_date: scanDate,
      time_in: kTimeIn ? parseTimeCell(row[kTimeIn]) : null,
      time_out: kTimeOut ? parseTimeCell(row[kTimeOut]) : null,
    });
  });

  if (parsed.length === 0) {
    return NextResponse.json({ error: "ไม่มีแถวที่นำเข้าได้เลย ตรวจสอบรูปแบบไฟล์อีกครั้ง", skippedReasons }, { status: 400 });
  }

  // 1) หา employee ที่มีอยู่แล้วในหน่วยงานนี้ (ตาม fingerprint_no)
  const fingerprintSet = Array.from(new Set(parsed.map((r) => r.fingerprint_no)));
  const { data: existingEmployees, error: existErr } = await supabase
    .from("employees")
    .select("id, fingerprint_no")
    .eq("agency_id", agencyId)
    .in("fingerprint_no", fingerprintSet);

  if (existErr) {
    return NextResponse.json({ error: "ค้นหาลูกจ้างที่มีอยู่ไม่สำเร็จ: " + existErr.message }, { status: 500 });
  }

  const employeeIdByFingerprint = new Map<string, string>();
  for (const e of existingEmployees ?? []) employeeIdByFingerprint.set(e.fingerprint_no, e.id);

  // 2) สร้างลูกจ้างใหม่สำหรับเลขสแกนนิ้วที่ยังไม่มี (ใช้ชื่อ/คำนำหน้าจากแถวแรกที่เจอของเลขนั้น)
  const newFingerprints = fingerprintSet.filter((fp) => !employeeIdByFingerprint.has(fp));
  let employeesCreated = 0;

  if (newFingerprints.length > 0) {
    const firstRowByFingerprint = new Map<string, ParsedRow>();
    for (const r of parsed) {
      if (newFingerprints.includes(r.fingerprint_no) && !firstRowByFingerprint.has(r.fingerprint_no)) {
        firstRowByFingerprint.set(r.fingerprint_no, r);
      }
    }
    const toInsert = newFingerprints.map((fp) => {
      const r = firstRowByFingerprint.get(fp)!;
      return {
        agency_id: agencyId,
        prefix: r.prefix || "",
        first_name: r.first_name || "(ไม่ระบุชื่อ)",
        last_name: r.last_name || "",
        daily_rate: 350,
        fingerprint_no: fp,
        status: "active",
      };
    });
    const { data: created, error: createErr } = await supabase.from("employees").insert(toInsert).select("id, fingerprint_no");
    if (createErr) {
      return NextResponse.json({ error: "สร้างลูกจ้างใหม่ไม่สำเร็จ: " + createErr.message }, { status: 500 });
    }
    for (const e of created ?? []) employeeIdByFingerprint.set(e.fingerprint_no, e.id);
    employeesCreated = created?.length ?? 0;
  }

  // 3) เตรียมแถว attendance_scans — dedupe (employee_id + scan_date) เอาแถวหลังสุดถ้าซ้ำ
  const scanMap = new Map<string, { employee_id: string; scan_date: string; time_in: string | null; time_out: string | null; source: string; imported_by: string }>();
  for (const r of parsed) {
    const employeeId = employeeIdByFingerprint.get(r.fingerprint_no);
    if (!employeeId) continue;
    const key = `${employeeId}__${r.scan_date}`;
    scanMap.set(key, {
      employee_id: employeeId,
      scan_date: r.scan_date,
      time_in: r.time_in,
      time_out: r.time_out,
      source: "import",
      imported_by: user.id,
    });
  }
  const scanRows = Array.from(scanMap.values());

  const { error: upsertErr } = await supabase.from("attendance_scans").upsert(scanRows, { onConflict: "employee_id,scan_date" });
  if (upsertErr) {
    return NextResponse.json({ error: "บันทึกข้อมูลสแกนนิ้วไม่สำเร็จ: " + upsertErr.message }, { status: 500 });
  }

  // 4) คำนวณสรุปวันทำงาน/ยอดเงินใหม่ทั้งรอบ
  const { error: rpcErr } = await supabase.rpc("recompute_payroll_details", { p_period_id: periodId });
  if (rpcErr) {
    return NextResponse.json(
      { error: "นำเข้าข้อมูลสแกนนิ้วสำเร็จ แต่คำนวณยอดใหม่ไม่สำเร็จ: " + rpcErr.message + " (ลองเปิดหน้ารายงานเพื่อคำนวณใหม่อีกครั้ง)" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    employeesCreated,
    scansImported: scanRows.length,
    rowsSkipped: skippedReasons.length,
    skippedReasons,
  });
}
