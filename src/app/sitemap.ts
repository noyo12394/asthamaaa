import type { MetadataRoute } from "next";

const routes = ["", "/terrain-smoke", "/water-pilot", "/compare", "/outlook", "/equity", "/simulator", "/monitor-gaps", "/watchlist", "/alerts", "/clinic", "/methods"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `https://asthamaaa.vercel.app${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/water-pilot" || route === "/terrain-smoke" ? "daily" : "weekly",
    priority: route === "" ? 1 : route === "/water-pilot" || route === "/terrain-smoke" ? 0.9 : 0.7,
  }));
}
