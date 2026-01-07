// Types for dynamic processing times from USCIS and DOL
// This module provides adapters between DynamicData and the internal ProcessingTimes format

import { DynamicData } from "./dynamic-data";
import { CountryOfBirth } from "./filter-paths";

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

// Convert DynamicData to ProcessingTimes format
export function adaptDynamicData(data: DynamicData): ProcessingTimes {
  const { processingTimes } = data;

  // Helper to create form times with optional premium
  const makeFormTimes = (
    form: { min: number; max: number; premiumDays?: number },
    asOf: string
  ): USCISFormTimes[] => {
    const times: USCISFormTimes[] = [
      {
        serviceCenter: "National",
        processingTime: { min: form.min, max: form.max },
        asOf,
      },
    ];
    if (form.premiumDays !== undefined && form.premiumDays > 0) {
      times.push({
        serviceCenter: "Premium",
        processingTime: { min: form.premiumDays / 30, max: form.premiumDays / 30 },
        asOf,
      });
    }
    return times;
  };

  return {
    lastUpdated: data.lastUpdated,
    uscis: {
      "I-140": makeFormTimes(processingTimes.i140, data.lastUpdated),
      "I-485": makeFormTimes(processingTimes.i485, data.lastUpdated),
      "I-765": makeFormTimes(processingTimes.i765, data.lastUpdated),
      "I-130": makeFormTimes(processingTimes.i130, data.lastUpdated),
      "I-129": makeFormTimes(processingTimes.i129, data.lastUpdated),
    },
    dol: {
      pwd: {
        currentlyProcessing: processingTimes.pwd.currentlyProcessing,
        estimatedMonths: processingTimes.pwd.months,
        asOf: data.lastUpdated,
      },
      perm: {
        analystReview: {
          currentlyProcessing: processingTimes.perm.currentlyProcessing,
          estimatedMonths: processingTimes.perm.months,
        },
        auditReview: {
          currentlyProcessing: processingTimes.permAudit.currentlyProcessing,
          estimatedMonths: processingTimes.permAudit.months,
        },
        asOf: data.lastUpdated,
      },
    },
  };
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

// Priority date calculation utilities for visa bulletin backlogs

// Calculate months of backlog from a priority date string
// Returns 0 for "Current", otherwise calculates months from priority date to today
export function calculatePriorityDateWait(priorityDateStr: string): number {
  const trimmed = priorityDateStr.trim().toLowerCase();
  if (trimmed === "current" || trimmed === "c") {
    return 0;
  }

  // Parse "Jul 2013" or "Feb 2023" format
  const shortMonths: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const parts = priorityDateStr.split(" ");
  if (parts.length !== 2) return 0;

  const monthName = parts[0].toLowerCase().slice(0, 3);
  const year = parseInt(parts[1], 10);
  const monthNum = shortMonths[monthName];

  if (monthNum === undefined || isNaN(year)) return 0;

  const priorityDate = new Date(year, monthNum, 1);
  const today = new Date();

  // Calculate months from priority date to today (the backlog)
  const diffMonths =
    (today.getFullYear() - priorityDate.getFullYear()) * 12 +
    (today.getMonth() - priorityDate.getMonth());

  return Math.max(0, diffMonths);
}

// Get priority date string for a GC category and country from visa bulletin data
export function getPriorityDateForPath(
  priorityDates: DynamicData["priorityDates"],
  gcCategory: string,
  countryOfBirth: CountryOfBirth
): string {
  // Normalize category name
  const category = gcCategory.toLowerCase().replace(/[- ]/g, "");

  // Map category to visa bulletin EB category
  let ebCategory: "eb1" | "eb2" | "eb3";
  if (
    category.includes("eb1") ||
    category === "eb1a" ||
    category === "eb1b" ||
    category === "eb1c"
  ) {
    ebCategory = "eb1";
  } else if (category.includes("eb2") || category.includes("niw")) {
    ebCategory = "eb2";
  } else if (category.includes("eb3")) {
    ebCategory = "eb3";
  } else {
    // Marriage-based, EB-5, etc. - no employment backlog
    return "Current";
  }

  const dates = priorityDates[ebCategory];
  if (!dates) return "Current";

  switch (countryOfBirth) {
    case "india":
      return dates.india;
    case "china":
      return dates.china;
    default:
      return dates.allOther;
  }
}

// Format priority wait for display
export function formatPriorityWait(months: number): string {
  if (months === 0) return "Current";
  if (months < 12) {
    return `~${months} mo`;
  }
  const years = Math.round(months / 12);
  if (years === 1) {
    return "~1 year";
  }
  return `~${years} years`;
}
