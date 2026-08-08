import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./components/pwa-register";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Relationship Boundary Map",
    template: "%s · Relationship Boundary Map",
  },
  description: "在具体关系情境里，辨认接受边界、关键条件、潜在代价与未知区域。",
  applicationName: "Relationship Boundary Map",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    title: "Relationship Boundary Map",
    description: "先看见边界，再讨论关系。",
    siteName: "Relationship Boundary Map",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Relationship Boundary Map" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Relationship Boundary Map",
    description: "先看见边界，再讨论关系。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f1eb",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
