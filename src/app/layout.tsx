import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Nav } from "@/components/nav";
import { SEASON } from "@/lib/fpl/rules";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `FPL Helper — ${SEASON} data-driven Fantasy Premier League assistant`,
  description:
    "Expected points projections, a squad optimiser and transfer advice for Fantasy Premier League, built on live FPL data and the 2026/27 rules.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-6 text-xs text-ink-dim sm:px-6">
          <div className="mx-auto max-w-7xl space-y-1">
            <p>
              Built on the public Fantasy Premier League API. Not affiliated with
              the Premier League. Scoring and squad rules follow the {SEASON}{" "}
              season.
            </p>
            <p>
              Projections are estimates. They tell you where the odds sit, not
              what will happen.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
