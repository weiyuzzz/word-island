import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Word Island · 单词岛屿",
    template: "%s · Word Island",
  },
  description: "在建设岛屿的过程中自然地记住英语单词：学习、复习、获得金币、建造你的小岛。",
  applicationName: "Word Island",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Word Island", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2b8ad6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
