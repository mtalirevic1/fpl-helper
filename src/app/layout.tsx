import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Nav } from "@/components/nav";
import { SEASON } from "@/lib/fpl/rules";
import { rootMetadata, siteJsonLd, SITE_NAME } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = rootMetadata();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = siteJsonLd();

  return (
    <html
      lang="en-GB"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-6 text-xs text-ink-dim sm:px-6">
          <div className="mx-auto max-w-7xl space-y-1">
            <p>
              {SITE_NAME} is built on the public Fantasy Premier League API. Not
              affiliated with the Premier League. Scoring and squad rules follow
              the {SEASON} season.
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
