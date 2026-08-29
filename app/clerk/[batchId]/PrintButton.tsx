"use client";

export default function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      พิมพ์รายงาน
    </button>
  );
}
