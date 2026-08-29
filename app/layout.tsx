import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบจ่ายเงินลูกจ้างรายวัน",
  description: "ระบบตรวจสอบและจ่ายเงินลูกจ้างรายวัน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
