import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = "https://stateside.app";
  const lastModified = new Date();

  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    // Add more pages here as the site grows
    // {
    //   url: `${siteUrl}/about`,
    //   lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.8,
    // },
  ];
}
