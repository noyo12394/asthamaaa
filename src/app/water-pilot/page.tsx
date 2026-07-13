import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import PfasWaterAtlas from "@/components/water/PfasWaterAtlas";

export const metadata: Metadata = {
  title: "Water & PFAS Intelligence",
  description:
    "Explore official PFAS drinking-water and ambient-water monitoring records for Delaware, Maryland, New Jersey, New York, and Pennsylvania.",
};

export default function WaterPilotPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <PfasWaterAtlas />
    </div>
  );
}
