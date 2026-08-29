import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// ใช้ใน Server Component / Server Action / Route Handler เท่านั้น
// อาศัย session ของผู้ใช้ที่ login อยู่ (ผ่าน cookie) — สิทธิ์อ่าน/เขียนถูกจำกัดด้วย RLS
// ตาม role ของผู้ใช้คนนั้นเสมอ ไม่ได้ bypass RLS ใด ๆ (ไม่ได้ใช้ service_role key)
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // เรียกจาก Server Component ล้วน (ไม่ใช่ Action/Route Handler) — เขียน cookie ไม่ได้
            // แต่ middleware.ts จะ refresh session ให้แทน จึงเพิกเฉยได้อย่างปลอดภัย
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // ดูหมายเหตุด้านบน
          }
        },
      },
    }
  );
}
