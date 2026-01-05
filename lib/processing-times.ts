// Types for dynamic processing times from USCIS and DOL

export interface USCISFormTimes {
  serviceCenter: string;
  processingTime: { min: number; max: number }; // in months
  asOf: string;
}

export interface DOLTimes {
  pwd: {
    currentlyProcessing: string; // "July 2025"
    estimatedMonths: number;
    asOf: string;
  };
  perm: {
    analystReview: {
      currentlyProcessing: string; // "August 2024"
      estimatedMonths: number;
    };
    auditReview: {
      currentlyProcessing: string;
      estimatedMonths: number;
    };
    asOf: string;
  };
}

export interface ProcessingTimes {
  lastUpdated: string;
  uscis: {
    "I-140": USCISFormTimes[];
    "I-485": USCISFormTimes[];
    "I-765": USCISFormTimes[];
    "I-130": USCISFormTimes[];
    "I-129": USCISFormTimes[]; // H-1B, L-1, O-1
  };
  dol: DOLTimes;
}

// Default fallback values if fetch fails
export const DEFAULT_PROCESSING_TIMES: ProcessingTimes = {
  lastUpdated: "2025-12-01",
  uscis: {
    "I-140": [
      { serviceCenter: "Texas", processingTime: { min: 6, max: 9 }, asOf: "2025-12-01" },
      { serviceCenter: "Nebraska", processingTime: { min: 5, max: 8 }, asOf: "2025-12-01" },
    ],
    "I-485": [
      { serviceCenter: "National", processingTime: { min: 10, max: 18 }, asOf: "2025-12-01" },
    ],
    "I-765": [
      { serviceCenter: "National", processingTime: { min: 3, max: 5 }, asOf: "2025-12-01" },
    ],
    "I-130": [
      { serviceCenter: "National", processingTime: { min: 12, max: 24 }, asOf: "2025-12-01" },
    ],
    "I-129": [
      { serviceCenter: "National", processingTime: { min: 1, max: 3 }, asOf: "2025-12-01" },
    ],
  },
  dol: {
    pwd: {
      currentlyProcessing: "July 2025",
      estimatedMonths: 6,
      asOf: "2025-12-01",
    },
    perm: {
      analystReview: {
        currentlyProcessing: "August 2024",
        estimatedMonths: 17,
      },
      auditReview: {
        currentlyProcessing: "March 2024",
        estimatedMonths: 22,
      },
      asOf: "2025-12-01",
    },
  },
};

// Helper to calculate months between a "Month Year" string and today
export function calculateMonthsFromDate(dateStr: string): number {
  const months: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3,
    May: 4, June: 5, July: 6, August: 7,
    September: 8, October: 9, November: 10, December: 11,
  };

  const parts = dateStr.split(" ");
  if (parts.length !== 2) return 12; // fallback

  const monthName = parts[0];
  const year = parseInt(parts[1], 10);
  const monthNum = months[monthName];

  if (monthNum === undefined || isNaN(year)) return 12; // fallback

  const targetDate = new Date(year, monthNum, 1);
  const today = new Date();

  const diffMonths = (today.getFullYear() - targetDate.getFullYear()) * 12
    + (today.getMonth() - targetDate.getMonth());

  return Math.max(0, diffMonths);
}

// Get the best processing time for a form (average across service centers)
export function getAverageProcessingTime(
  times: ProcessingTimes,
  form: keyof ProcessingTimes["uscis"]
): { min: number; max: number; display: string } {
  const formTimes = times.uscis[form];
  if (!formTimes || formTimes.length === 0) {
    return { min: 6, max: 12, display: "6-12 mo" };
  }

  const avgMin = formTimes.reduce((sum, t) => sum + t.processingTime.min, 0) / formTimes.length;
  const avgMax = formTimes.reduce((sum, t) => sum + t.processingTime.max, 0) / formTimes.length;

  return {
    min: avgMin,
    max: avgMax,
    display: formatMonths(avgMin, avgMax),
  };
}

// Format months as display string
export function formatMonths(min: number, max: number): string {
  if (min < 1 && max < 1) {
    const minDays = Math.round(min * 30);
    const maxDays = Math.round(max * 30);
    return `${minDays}-${maxDays}d`;
  }
  if (min < 1) {
    const minDays = Math.round(min * 30);
    return `${minDays}d-${Math.round(max)}mo`;
  }
  return `${Math.round(min)}-${Math.round(max)} mo`;
}
