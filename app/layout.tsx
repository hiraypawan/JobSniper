import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StartupSniper · Funded startups that are hiring",
  description:
    "Startups funded in the last year, pulled from YC, Work at a Startup, funding news, Product Hunt and Hacker News. Real job boards, a 0-100 fit score and a first pitch you can send.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased bg-[var(--bg-cream)] text-[var(--text-warm)]">
        {children}
      </body>
    </html>
  );
}
