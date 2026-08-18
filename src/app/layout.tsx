import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://asthamaaa.vercel.app"),
  title: {
    default: "PASS Equity Atlas",
    template: "%s · PASS Equity Atlas",
  },
  description:
    "Environmental health intelligence: live air quality, EPA monitor coverage confidence, community health vulnerability, and equity-aware alert priority — with a source trail behind every number.",
  applicationName: "PASS Equity Atlas",
  keywords: ["air quality", "wildfire smoke", "terrain", "PM2.5", "PFAS", "water quality", "environmental health", "EPA", "public health"],
  openGraph: {
    type: "website",
    siteName: "PASS Equity Atlas",
    title: "PASS Equity Atlas",
    description: "Source-transparent air and water monitoring intelligence for communities and researchers.",
  },
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
