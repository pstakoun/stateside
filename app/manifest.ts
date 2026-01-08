import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stateside - US Immigration Pathways",
    short_name: "Stateside",
    description:
      "Find your fastest path to a US green card. Interactive tool with live USCIS data.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#22c55e",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    categories: ["utilities", "productivity"],
    lang: "en-US",
    dir: "ltr",
  };
}
