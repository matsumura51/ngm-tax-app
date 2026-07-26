import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "業務管理システム",
  description: "税理士法人 業務管理アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
