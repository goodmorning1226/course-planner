import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { FooterNotice } from "@/components/layout/FooterNotice";
import { DisclaimerDialog } from "@/components/disclaimer/DisclaimerDialog";
import { BackToTop } from "@/components/layout/BackToTop";
import { PageViewTracker } from "@/components/PageViewTracker";
import { Heartbeat } from "@/components/Heartbeat";

export const metadata: Metadata = {
  // Fixed tab title on every page — child pages intentionally don't override it.
  title: "急急排排（NTU）",
  description:
    "非官方的臺大 115-1 暫排課工具。資料整理自公開可查詢之教室課表，僅供提前安排課程參考，正式資訊以臺大課程網公告為準。",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <FooterNotice />
        <DisclaimerDialog />
        <BackToTop />
        <PageViewTracker />
        <Heartbeat />
      </body>
    </html>
  );
}
