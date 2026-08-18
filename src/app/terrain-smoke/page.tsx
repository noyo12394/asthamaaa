import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import TerrainSmokeLab from "@/components/terrain/TerrainSmokeLab";

export const metadata: Metadata = {
  title: "Terrain & Smoke Lab",
  description:
    "Explore lowland-highland PM2.5 contrasts, NOAA satellite smoke, and terrain-aware held-out model tests.",
};

export default function TerrainSmokePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <TerrainSmokeLab />
    </div>
  );
}
