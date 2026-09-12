import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OpenOrder",
  description: "Conversational beverage ordering",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
