import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PASS Equity Atlas",
    template: "%s · PASS Equity Atlas",
  },
  description:
    "Environmental health intelligence: live air quality, EPA monitor coverage confidence, community health vulnerability, and equity-aware alert priority — with a source trail behind every number.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
