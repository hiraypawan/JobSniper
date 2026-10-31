import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobSniper | Discover jobs and research companies",
  description:
    "Explore startup and remote job leads, find India-eligible and entry-level signals, and research companies. Check the original listing before applying.",
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
