import { createBrowserClient } from "@supabase/ssr";

// หมายเหตุ: ไม่ได้ผูก generic <Database> เพราะไฟล์นี้เป็นสตาร์ทเตอร์ที่เขียน type ของแต่ละตาราง
// เอาไว้เองใน lib/types.ts (เร็วกว่าและอ่านง่ายกว่าไฟล์ type ที่ gen อัตโนมัติทั้งสคีมา)
// ถ้าต้องการ type เข้มขึ้นภายหลัง รันคำสั่ง: supabase gen types typescript --project-id uhefxwccuqagnbrbidbh
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
