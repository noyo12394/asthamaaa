import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://asthamaaa.vercel.app"),
  title: {
    default: "EarthPulse — The Living Impact Atlas",
    template: "%s · EarthPulse",
  },
  description:
    "An explainable living atlas that shows how hazards cascade through roads, hospitals, schools, and the services communities depend on.",
  applicationName: "EarthPulse",
  keywords: ["hazards", "flooding", "infrastructure", "geospatial", "public data", "Lehigh Valley"],
  openGraph: {
    type: "website",
    siteName: "EarthPulse",
    title: "EarthPulse — The Living Impact Atlas",
    description: "See the chain reaction before it reaches you.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "EarthPulse living impact atlas" }],
  },
  twitter: { card: "summary_large_image", title: "EarthPulse — The Living Impact Atlas", description: "See the chain reaction before it reaches you.", images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
