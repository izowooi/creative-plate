import type { MetadataRoute } from "next";
import { getAllEntries } from "@/lib/db";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();
  return [
    { url: baseUrl, priority: 1 },
    { url: `${baseUrl}/explore`, priority: 0.9 },
    { url: `${baseUrl}/about`, priority: 0.6 },
    ...getAllEntries().map((entry) => ({
      url: `${baseUrl}/archive/${entry.slug}`,
      priority: entry.featured ? 0.8 : 0.7,
    })),
  ];
}
