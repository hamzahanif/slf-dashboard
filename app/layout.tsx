import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLF Dashboard | Sober Living Finder",
  description: "VA performance tracking and QA for SoberLivingFinder.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50">{children}</body>
    </html>
  );
}
