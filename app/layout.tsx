import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StartupSniper · Daily Funded Startups & Remote Hiring Radar",
  description:
    "Live tracker for fresh startups funded within the last 12 months (YC W25–F26, WAAS, Wellfound/Seed, Product Hunt, Indie/HN) with verified ATS job boards and 5-day build outreach pitch studio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
