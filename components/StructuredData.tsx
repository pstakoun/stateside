// JSON-LD Structured Data for SEO
// Helps search engines understand the content and show rich snippets

export function WebsiteStructuredData() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Stateside",
    description:
      "Find your fastest path to a US green card. Interactive tool showing H-1B, TN, EB-1, EB-2, EB-3 visa timelines with live USCIS processing times and visa bulletin data.",
    url: "https://stateside.app",
    applicationCategory: "UtilityApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Live USCIS processing times",
      "Visa bulletin priority date tracking",
      "Employment-based green card pathways (EB-1, EB-2, EB-3)",
      "H-1B to green card timeline calculator",
      "TN visa to green card pathway",
      "NIW (National Interest Waiver) eligibility",
      "Concurrent filing eligibility checker",
      "India and China backlog estimates",
    ],
    screenshot: "https://stateside.app/opengraph-image",
    // Note: Only add aggregateRating when you have real user reviews
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

export function FAQStructuredData() {
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "How long does it take to get a green card from H-1B?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For most countries, the H-1B to green card process takes 2-4 years. However, for India and China, the wait can be 10+ years due to per-country visa limits and significant backlogs. The timeline includes PERM labor certification (6-12 months), I-140 petition (6-9 months or 15 days with premium processing), and I-485 adjustment of status (10-18 months when your priority date is current).",
        },
      },
      {
        "@type": "Question",
        name: "What is the fastest path to a US green card?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The fastest employment-based paths are: 1) EB-1A for individuals with extraordinary ability (self-petition, no labor certification needed, 1-2 years), 2) EB-2 NIW National Interest Waiver (self-petition, no employer sponsorship, 1-3 years for most countries), 3) Marriage to a US citizen (6-12 months). For most workers, TN visa holders from Canada/Mexico often have a faster path than H-1B holders due to no lottery requirement.",
        },
      },
      {
        "@type": "Question",
        name: "What is the current EB-2 priority date for India?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The EB-2 priority date for India changes monthly with the visa bulletin. As of 2024-2025, it's typically in the 2012-2014 range, meaning there's a 10-12+ year backlog. Check the Department of State visa bulletin for the most current dates. Stateside shows live visa bulletin data to help you track your priority date.",
        },
      },
      {
        "@type": "Question",
        name: "Can I file I-485 while on H-1B?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, you can file I-485 (adjustment of status) while on H-1B if your priority date is current according to the visa bulletin 'Dates for Filing' chart. You can even file I-485 concurrently with your I-140 petition if your priority date is already current. While I-485 is pending, you can get an EAD (work permit) and travel document.",
        },
      },
      {
        "@type": "Question",
        name: "What is EB-2 NIW and who qualifies?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "EB-2 NIW (National Interest Waiver) allows you to self-petition for a green card without employer sponsorship or labor certification. You need: 1) An advanced degree (Master's or higher) OR Bachelor's + 5 years progressive experience, 2) Work in an area of 'substantial intrinsic merit', 3) Demonstrate that waiving the job offer requirement benefits the US. Common qualifiers include researchers, engineers, healthcare professionals, and entrepreneurs.",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }}
    />
  );
}

export function OrganizationStructuredData() {
  const orgData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Stateside",
    url: "https://stateside.app",
    logo: "https://stateside.app/icon.svg",
    description:
      "Interactive US immigration pathway tool with live USCIS data",
    // Add social links when available:
    // sameAs: ["https://twitter.com/statesideapp", "https://linkedin.com/company/stateside"],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(orgData) }}
    />
  );
}

// Combined component for all structured data
export function AllStructuredData() {
  return (
    <>
      <WebsiteStructuredData />
      <FAQStructuredData />
      <OrganizationStructuredData />
    </>
  );
}
