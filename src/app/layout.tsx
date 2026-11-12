import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Kea: connected maternal care",
    template: "%s | Kea",
  },
  description:
    "Kea connects clinics, hospitals and patients so maternal healthcare referrals can be tracked, coordinated and followed through.",
  applicationName: "Kea",
  keywords: [
    "maternal health",
    "referral tracking",
    "continuity of care",
    "health system coordination",
    "open source health software",
  ],
  openGraph: {
    type: "website",
    siteName: "Kea",
    title: "Every maternal referral deserves a confirmed outcome",
    description:
      "Kea connects clinics, hospitals and patients so maternal healthcare referrals can be tracked, coordinated and followed through.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "Kea" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kea: connected maternal care",
    description:
      "Referral tracking and continuity of care for maternal health services.",
    images: ["/brand/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#55205C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.variable, jakarta.variable, "font-sans")}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-plum-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
