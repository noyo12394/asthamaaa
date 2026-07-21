import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import LocalRiskClient from "@/components/local-risk/LocalRiskClient";

export const metadata: Metadata = {
  title: "Local risk",
  description:
    "A plain-language overview of current environmental conditions, official alerts, nearby water evidence, and practical public-health guidance.",
};

export default function LocalRiskPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <LocalRiskClient />
    </div>
  );
}
