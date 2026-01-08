import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PostHogProvider } from "@/components/PostHogProvider";
import { AllStructuredData } from "@/components/StructuredData";

const siteUrl = "https://stateside.app";
const siteName = "Stateside";
const siteDescription =
  "Find your fastest path to a US green card. Interactive tool showing H-1B, TN, EB-1, EB-2, EB-3 visa timelines with live USCIS processing times and visa bulletin data.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Stateside - Find Your Fastest Path to a US Green Card",
    template: "%s | Stateside",
  },
  description: siteDescription,
  keywords: [
    "US immigration",
    "green card",
    "green card timeline",
    "H-1B visa",
    "H-1B to green card",
    "TN visa",
    "TN to green card",
    "USCIS processing times",
    "visa bulletin",
    "priority date",
    "EB-1 visa",
    "EB-2 visa",
    "EB-2 NIW",
    "EB-3 visa",
    "immigration lawyer alternative",
    "PERM labor certification",
    "I-140 processing time",
    "I-485 processing time",
    "work visa USA",
    "OPT to green card",
    "F-1 to green card",
    "L-1 visa",
    "O-1 visa",
    "employment-based green card",
    "marriage green card",
    "Indian green card backlog",
    "China green card backlog",
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  // Canonical URL
  alternates: {
    canonical: siteUrl,
  },
  // Open Graph
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: siteName,
    title: "Stateside - Find Your Fastest Path to a US Green Card",
    description: siteDescription,
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "Stateside - Interactive US immigration pathway tool",
      },
    ],
  },
  // Twitter/X
  twitter: {
    card: "summary_large_image",
    title: "Stateside - Find Your Fastest Path to a US Green Card",
    description: siteDescription,
    images: [`${siteUrl}/opengraph-image`],
  },
  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  // Verification (add your codes when you have them)
  // verification: {
  //   google: "your-google-verification-code",
  //   yandex: "your-yandex-verification-code",
  // },
  // App info
  applicationName: siteName,
  category: "immigration",
  classification: "Immigration Tools",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <AllStructuredData />
      </head>
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
