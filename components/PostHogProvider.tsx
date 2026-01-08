"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Only initialize in browser and if API key is set
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        // Use our domain proxy to avoid ad blockers (Brave, Firefox, etc.)
        api_host: "/ingest",
        ui_host: "https://us.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        // Respect Do Not Track
        respect_dnt: true,
        // Disable in development unless explicitly enabled
        loaded: (posthog) => {
          if (process.env.NODE_ENV === "development") {
            // Uncomment to debug in dev:
            // posthog.debug();
          }
        },
      });
    }
  }, []);

  // If no API key, just render children without PostHog
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export default PostHogProvider;
