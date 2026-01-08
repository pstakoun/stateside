/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy PostHog through our domain to avoid ad blockers
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // Required to prevent the rewrite from being blocked
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
