import type { MetadataRoute } from "next";

import { buildProjections } from "@/lib/model/projections";
import { absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();
  const routes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: absoluteUrl("/players"),
      lastModified,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/fixtures"),
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/optimizer"),
      lastModified,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/my-team"),
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  try {
    const projections = await buildProjections(1);
    for (const player of projections.players) {
      routes.push({
        url: absoluteUrl(`/players/${player.id}`),
        lastModified,
        changeFrequency: "daily",
        priority: 0.6,
      });
    }
  } catch {
    // Live FPL data can be unavailable at build time; keep the core routes.
  }

  return routes;
}
