"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ERROR_MESSAGES: Record<string, string> = {
  no_profile: "ไม่พบข้อมูลผู้ใช้ในระบบ ติดต่อผู้ดูแลระบบให้เพิ่มบัญชีนี้ในตาราง profiles",
  unsupported_role: "บทบาทของบัญชีนี้ยังไม่มีหน้าจอในระบบ (รองรับเฉพาะธุรการต้นสังกัดและการเงินตอนนี้)",
};

// useSearchParams() ต้องอยู่ใต้ Suspense boundary เสมอ (ข้อกำหนดของ Next.js App Router)
// ไม่งั้น build จะ error ตอน prerender หน้านี้
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError ? ERROR_MESSAGES[urlError] ?? urlError : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 360 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--accent-ink)", textTransform: "uppercase" }}>
            Payroll Audit
          </div>
          <h1 style={{ fontSize: 20, marginTop: 6 }}>ระบบจ่ายเงินลูกจ้างรายวัน</h1>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <label htmlFor="email">อีเมล</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">รหัสผ่าน</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn primary" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
