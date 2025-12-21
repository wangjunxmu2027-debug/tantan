import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI调研助手 - 探探",
  description: "飞书企业访谈助手，通过对话了解您的业务需求",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

