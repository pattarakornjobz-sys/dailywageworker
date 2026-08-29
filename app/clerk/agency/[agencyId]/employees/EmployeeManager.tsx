"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Employee } from "@/lib/types";

type FormState = {
  prefix: string;
  first_name: string;
  last_name: string;
  position: string;
  daily_rate: string;
  fingerprint_no: string;
  bank_account_no: string;
  bank_name: string;
  bank_branch: string;
};

const EMPTY_FORM: FormState = {
  prefix: "",
  first_name: "",
  last_name: "",
  position: "",
  daily_rate: "",
  fingerprint_no: "",
  bank_account_no: "",
  bank_name: "",
  bank_branch: "",
};

function toForm(e: Employee): FormState {
  return {
    prefix: e.prefix ?? "",
    first_name: e.first_name ?? "",
    last_name: e.last_name ?? "",
    position: e.position ?? "",
    daily_rate: String(e.daily_rate ?? ""),
    fingerprint_no: e.fingerprint_no ?? "",
    bank_account_no: e.bank_account_no ?? "",
    bank_name: e.bank_name ?? "",
    bank_branch: e.bank_branch ?? "",
  };
}

export default function EmployeeManager({ agencyId, initialEmployees }: { agencyId: string; initialEmployees: Employee[] }) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialEmployees);
  const [showInactive, setShowInactive] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function validate(f: FormState): string | null {
    if (!f.first_name.trim() || !f.last_name.trim()) return "กรอกชื่อ-นามสกุลให้ครบ";
    if (!f.fingerprint_no.trim()) return "กรอกเลขสแกนนิ้วให้ครบ";
    const rate = Number(f.daily_rate);
    if (!rate || rate <= 0) return "อัตราค่าจ้าง/วัน ต้องมากกว่า 0";
    return null;
  }

  async function handleAdd() {
    const err = validate(addForm);
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insErr } = await supabase
      .from("employees")
      .insert({
        agency_id: agencyId,
        prefix: addForm.prefix.trim(),
        first_name: addForm.first_name.trim(),
        last_name: addForm.last_name.trim(),
        position: addForm.position.trim() || null,
        daily_rate: Number(addForm.daily_rate),
        fingerprint_no: addForm.fingerprint_no.trim(),
        bank_account_no: addForm.bank_account_no.trim() || null,
        bank_name: addForm.bank_name.trim() || null,
        bank_branch: addForm.bank_branch.trim() || null,
        status: "active",
      })
      .select(
        "id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status"
      )
      .single();

    if (insErr || !data) {
      setError(
        insErr?.message.includes("duplicate")
          ? "เลขสแกนนิ้วนี้มีอยู่ในหน่วยงานนี้แล้ว"
          : "เพิ่มลูกจ้างไม่สำเร็จ: " + (insErr?.message ?? "unknown error")
      );
      setLoading(false);
      return;
    }

    setEmployees((prev) => [...prev, data as Employee].sort((a, b) => a.fingerprint_no.localeCompare(b.fingerprint_no)));
    setAddForm(EMPTY_FORM);
    setAddingOpen(false);
    setLoading(false);
    refresh();
  }

  function startEdit(e: Employee) {
    setEditingId(e.id);
    setEditForm(toForm(e));
    setError(null);
  }

  async function handleSaveEdit(id: string) {
    const err = validate(editForm);
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updErr } = await supabase
      .from("employees")
      .update({
        prefix: editForm.prefix.trim(),
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        position: editForm.position.trim() || null,
        daily_rate: Number(editForm.daily_rate),
        fingerprint_no: editForm.fingerprint_no.trim(),
        bank_account_no: editForm.bank_account_no.trim() || null,
        bank_name: editForm.bank_name.trim() || null,
        bank_branch: editForm.bank_branch.trim() || null,
      })
      .eq("id", id)
      .select(
        "id, agency_id, prefix, first_name, last_name, position, daily_rate, fingerprint_no, bank_account_no, bank_name, bank_branch, status"
      )
      .single();

    if (updErr || !data) {
      setError("บันทึกไม่สำเร็จ: " + (updErr?.message ?? "unknown error"));
      setLoading(false);
      return;
    }

    setEmployees((prev) => prev.map((e) => (e.id === id ? (data as Employee) : e)));
    setEditingId(null);
    setLoading(false);
    refresh();
  }

  async function toggleStatus(e: Employee) {
    const nextStatus = e.status === "active" ? "inactive" : "active";
    if (nextStatus === "inactive" && !confirm(`ปิดใช้งาน "${e.first_name} ${e.last_name}"? (ประวัติเดิมยังอยู่ครบ แค่ไม่นับวันทำงาน/แสดงในรายงานใหม่)`)) return;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updErr } = await supabase.from("employees").update({ status: nextStatus }).eq("id", e.id);
    if (updErr) {
      setError("เปลี่ยนสถานะไม่สำเร็จ: " + updErr.message);
      setLoading(false);
      return;
    }
    setEmployees((prev) => prev.map((emp) => (emp.id === e.id ? { ...emp, status: nextStatus } : emp)));
    setLoading(false);
    refresh();
  }

  function renderFormFields(f: FormState, setF: (f: FormState) => void) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 1fr", gap: 10 }}>
        <div className="field">
          <label>คำนำหน้า</label>
          <input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} />
        </div>
        <div className="field">
          <label>ชื่อ</label>
          <input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} />
        </div>
        <div className="field">
          <label>นามสกุล</label>
          <input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
        </div>
        <div className="field">
          <label>ตำแหน่ง</label>
          <input value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
        </div>
        <div className="field">
          <label>เลขสแกนนิ้ว</label>
          <input value={f.fingerprint_no} onChange={(e) => setF({ ...f, fingerprint_no: e.target.value })} />
        </div>
        <div className="field">
          <label>ค่าจ้าง/วัน</label>
          <input type="number" value={f.daily_rate} onChange={(e) => setF({ ...f, daily_rate: e.target.value })} />
        </div>
        <div className="field">
          <label>ธนาคาร</label>
          <input value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} />
        </div>
        <div className="field">
          <label>สาขา</label>
          <input value={f.bank_branch} onChange={(e) => setF({ ...f, bank_branch: e.target.value })} />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>เลขบัญชี</label>
          <input value={f.bank_account_no} onChange={(e) => setF({ ...f, bank_account_no: e.target.value })} />
        </div>
      </div>
    );
  }

  const visibleEmployees = employees.filter((e) => showInactive || e.status === "active");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--ink-soft)", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          แสดงคนที่ปิดใช้งานแล้วด้วย
        </label>
        <button className="btn primary" onClick={() => setAddingOpen((v) => !v)}>
          {addingOpen ? "ยกเลิก" : "+ เพิ่มลูกจ้าง"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {addingOpen && (
        <div className="card">
          <h3 style={{ marginBottom: 14, fontSize: 15 }}>เพิ่มลูกจ้างใหม่</h3>
          {renderFormFields(addForm, setAddForm)}
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={handleAdd} disabled={loading}>
              {loading ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th>เลขสแกนนิ้ว</th>
              <th>ชื่อ–นามสกุล</th>
              <th>ตำแหน่ง</th>
              <th>ค่าจ้าง/วัน</th>
              <th>บัญชีธนาคาร</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((e) =>
              editingId === e.id ? (
                <tr key={e.id}>
                  <td colSpan={7} style={{ padding: 16 }}>
                    {renderFormFields(editForm, setEditForm)}
                    <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                      <button className="btn primary" onClick={() => handleSaveEdit(e.id)} disabled={loading}>
                        {loading ? "กำลังบันทึก..." : "บันทึก"}
                      </button>
                      <button className="btn" onClick={() => setEditingId(null)}>
                        ยกเลิก
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={e.id} style={{ opacity: e.status === "inactive" ? 0.5 : 1 }}>
                  <td>{e.fingerprint_no}</td>
                  <td>
                    {e.prefix} {e.first_name} {e.last_name}
                  </td>
                  <td>{e.position ?? "-"}</td>
                  <td>{e.daily_rate.toLocaleString()}</td>
                  <td style={{ color: e.bank_account_no ? "var(--ink-soft)" : "var(--brick)" }}>
                    {e.bank_account_no ? `${e.bank_name ?? ""} ${e.bank_account_no}` : "ไม่มีเลขบัญชี"}
                  </td>
                  <td>{e.status === "active" ? "ใช้งานอยู่" : "ปิดใช้งาน"}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => startEdit(e)}>
                      แก้ไข
                    </button>
                    <button className={e.status === "active" ? "btn danger" : "btn"} onClick={() => toggleStatus(e)} disabled={loading}>
                      {e.status === "active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </td>
                </tr>
              )
            )}
            {visibleEmployees.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                  ยังไม่มีลูกจ้างในหน่วยงานนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
