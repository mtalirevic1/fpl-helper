import type { Metadata } from "next";

import { SEASON } from "./fpl/rules";

/** Product name chosen for search: keeps the high-volume "FPL" keyword. */
export const SITE_NAME = "FPL Edge";

export const SITE_TAGLINE = `${SEASON} Fantasy Premier League expected points, squad builder and transfer advice`;

export const SITE_DESCRIPTION =
  "FPL Edge projects expected points for every Fantasy Premier League player, builds the best squad for your budget, and ranks transfers and chips using live FPL data and the 2026/27 rules.";

/**
 * Canonical site origin. Set `NEXT_PUBLIC_SITE_URL` in production (no trailing
 * slash). Falls back to Vercel URLs, then localhost for local SEO previews.
 */
export function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/^https?:\/\//, "")}`;
  const preview = process.env.VERCEL_URL?.trim();
  if (preview) return `https://${preview.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export function absoluteUrl(path = "/"): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return `${siteOrigin()}${normalised === "/" ? "" : normalised}`;
}

export interface PageSeo {
  /** Short page title; layout template appends "| FPL Edge". */
  title: string;
  description: string;
  path: string;
  /** Override the document title entirely (no template). */
  absoluteTitle?: string;
}

/** Builds consistent Metadata for a route, including Open Graph and Twitter. */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
}: PageSeo): Metadata {
  const url = absoluteUrl(path);
  const fullTitle = absoluteTitle ?? title;
  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: absoluteTitle
        ? absoluteTitle
        : `${fullTitle} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_GB",
      type: "website",
      images: [
        {
          url: absoluteUrl("/logo.png"),
          width: 512,
          height: 512,
          alt: `${SITE_NAME} logo`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: absoluteTitle
        ? absoluteTitle
        : `${fullTitle} | ${SITE_NAME}`,
      description,
      images: [absoluteUrl("/logo.png")],
    },
  };
}

/** Root layout metadata shared by every page. */
export function rootMetadata(): Metadata {
  const origin = siteOrigin();
  return {
    metadataBase: new URL(origin),
    title: {
      default: `${SITE_NAME} — FPL expected points & squad optimiser`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
      "FPL",
      "Fantasy Premier League",
      "FPL expected points",
      "FPL transfer tips",
      "FPL squad builder",
      "FPL captain picks",
      "FPL chip advice",
      SEASON,
    ],
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    category: "sports",
    icons: {
      icon: "/logo.png",
      apple: "/logo.png",
    },
    openGraph: {
      title: `${SITE_NAME} — FPL expected points & squad optimiser`,
      description: SITE_DESCRIPTION,
      url: origin,
      siteName: SITE_NAME,
      locale: "en_GB",
      type: "website",
      images: [
        {
          url: absoluteUrl("/logo.png"),
          width: 512,
          height: 512,
          alt: `${SITE_NAME} logo`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: `${SITE_NAME} — FPL expected points & squad optimiser`,
      description: SITE_DESCRIPTION,
      images: [absoluteUrl("/logo.png")],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  };
}

/** JSON-LD for the product as a free web app. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    applicationCategory: "SportsApplication",
    operatingSystem: "Web",
    url: siteOrigin(),
    description: SITE_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "GBP",
    },
  };
}
