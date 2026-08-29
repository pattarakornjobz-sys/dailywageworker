/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfkit อ่านไฟล์ฟอนต์มาตรฐาน (.afm) จาก node_modules ตอนรันจริงด้วย fs — ต้องบอก Next
  // ให้รวมไฟล์เหล่านี้เข้าไปตอน build ด้วย ไม่งั้น serverless function บน Vercel จะหาไฟล์ไม่เจอ
  experimental: {
    outputFileTracingIncludes: {
      "/api/finance-report": ["./node_modules/pdfkit/js/data/**", "./lib/fonts/**"],
    },
  },
};

export default nextConfig;
