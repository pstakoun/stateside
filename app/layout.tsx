import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canadian Immigration Pathways - US Visa Guide",
  description: "Interactive guide for Canadians immigrating to the US. Explore visa paths, green card options, and citizenship timelines with real USCIS statistics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
