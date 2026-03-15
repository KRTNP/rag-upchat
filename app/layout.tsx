import type { Metadata } from "next";
import { Prompt, Sarabun } from "next/font/google";
import "./globals.css";

const bodyFont = Prompt({
  variable: "--font-body",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600"],
});

const displayFont = Sarabun({
  variable: "--font-display",
  subsets: ["latin", "thai"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RAG Upchat | มหาวิทยาลัยพะเยา",
  description: "ระบบผู้ช่วย AI สำหรับตอบคำถามและให้ข้อมูล อ้างอิงบริบทจากฐานข้อมูล",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
