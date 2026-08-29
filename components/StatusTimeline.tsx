import { STATUS_LABEL } from "@/lib/statusLabels";
import type { StatusEvent } from "@/lib/types";

// แสดงประวัติวันเวลาการเปลี่ยนสถานะทั้งหมดของ batch หนึ่งๆ — ข้อมูลบันทึกอัตโนมัติทุกครั้งที่
// สถานะเปลี่ยน (ผ่าน trigger ในฐานข้อมูล) แสดงแบบ append-only เรียงเก่า→ใหม่
export default function StatusTimeline({ events }: { events: StatusEvent[] }) {
  if (events.length === 0) {
    return <p style={{ color: "var(--muted)", fontSize: 13 }}>ยังไม่มีประวัติการเปลี่ยนสถานะ</p>;
  }

  return (
    <div className="card no-print">
      <h3 style={{ marginBottom: 14, fontSize: 15 }}>ประวัติสถานะ</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {events.map((ev, i) => (
          <div key={ev.id} style={{ display: "flex", gap: 12, paddingBottom: i === events.length - 1 ? 0 : 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
              {i !== events.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--line)", marginTop: 4 }} />}
            </div>
            <div style={{ paddingBottom: 2 }}>
              <div style={{ fontSize: 13.5 }}>
                {ev.from_status ? (
                  <>
                    {STATUS_LABEL[ev.from_status]} → <strong>{STATUS_LABEL[ev.to_status]}</strong>
                  </>
                ) : (
                  <>สร้างรายการ — <strong>{STATUS_LABEL[ev.to_status]}</strong></>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {new Date(ev.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                {ev.actor_name ? ` · ${ev.actor_name}` : ""}
              </div>
              {ev.note && <div style={{ fontSize: 12.5, color: "var(--brick)", marginTop: 2 }}>เหตุผล: {ev.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
