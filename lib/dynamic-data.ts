// Comprehensive dynamic data fetching from official sources
// Sources:
// - DOL FLAG: flag.dol.gov/processingtimes (PWD, PERM times)
// - DOL PERM Disclosure: dol.gov/agencies/eta/foreign-labor/performance (PERM certifications)
// - USCIS via GitHub: jzebedee/uscis daily SQLite releases
// - Visa Bulletin: travel.state.gov (priority dates)

import { 
  getPERMStatistics, 
  calculateVelocity, 
  PERMStatistics, 
  VelocityData 
} from "./perm-velocity";

export interface DynamicData {
  lastUpdated: string;
  sources: {
    dol: { url: string; fetchedAt: string };
    uscis: { url: string; fetchedAt: string };
    visaBulletin: { url: string; fetchedAt: string };
  };
  processingTimes: {
    // DOL times
    pwd: { months: number; currentlyProcessing: string };
    perm: { months: number; currentlyProcessing: string };
    permAudit: { months: number; currentlyProcessing: string };
    // USCIS times (in months)
    i140: { min: number; max: number; premiumDays: number };
    i485: { min: number; max: number; premiumDays?: number };
    i765: { min: number; max: number; premiumDays?: number };
    i130: { min: number; max: number; premiumDays?: number };
    i129: { min: number; max: number; premiumDays: number };
  };
  // Visa Bulletin has TWO charts:
  // - Final Action Dates: When your case will be APPROVED
  // - Dates for Filing: When you can SUBMIT your I-485 (usually more current)
  priorityDates: {
    eb1: { allOther: string; china: string; india: string };
    eb2: { allOther: string; china: string; india: string };
    eb3: { allOther: string; china: string; india: string };
  };
  // Dates for Filing - used to determine if you can file I-485 (concurrent filing)
  datesForFiling: {
    eb1: { allOther: string; china: string; india: string };
    eb2: { allOther: string; china: string; india: string };
    eb3: { allOther: string; china: string; india: string };
  };
  fees: {
    i140: number;
    i485: number;
    i765: number;
    i129H1B: number;
    i907: number;
    asylumFee: number;
    biometrics: number;
  };
  // PERM-based velocity data for more accurate wait time calculations
  permVelocity: {
    statistics: PERMStatistics;
    velocityByCategory: {
      eb1: { india: VelocityData; china: VelocityData; other: VelocityData };
      eb2: { india: VelocityData; china: VelocityData; other: VelocityData };
      eb3: { india: VelocityData; china: VelocityData; other: VelocityData };
    };
    lastUpdated: string;
  };
}

// Parse "Month Year" to months from now
// Uses month arithmetic (not milliseconds) to match DEFAULT_PROCESSING_TIMES
// and avoid jumps when live data is fetched
function parseMonthsFromDate(dateStr: string): number {
  const months: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3,
    May: 4, June: 5, July: 6, August: 7,
    September: 8, October: 9, November: 10, December: 11,
  };

  const match = dateStr.match(/(\w+)\s+(\d{4})/);
  if (!match) return 12;

  const [, monthName, yearStr] = match;
  const month = months[monthName];
  const year = parseInt(yearStr, 10);

  if (month === undefined || isNaN(year)) return 12;

  // Use month arithmetic for consistency with calculateMonthsFromDate
  // in processing-times.ts and DEFAULT_PROCESSING_TIMES values
  const today = new Date();
  const diffMonths = (today.getFullYear() - year) * 12
    + (today.getMonth() - month);

  return Math.max(0, diffMonths);
}

// Fetch DOL FLAG processing times
async function fetchDOLData(): Promise<{
  pwd: { months: number; currentlyProcessing: string };
  perm: { months: number; currentlyProcessing: string };
  permAudit: { months: number; currentlyProcessing: string };
}> {
  try {
    const response = await fetch("https://flag.dol.gov/processingtimes", {
      headers: { "User-Agent": "Stateside/1.0" },
    });

    if (!response.ok) throw new Error(`DOL fetch failed: ${response.status}`);

    const html = await response.text();

    // Parse PWD (H-1B OEWS) - look for H-1B row in PWD table
    // HTML structure: <td headers="a">H-1B</td><td headers="b">[Month Year]</td>
    // This represents the date DOL is currently processing (should be ~6 months ago)
    let pwdDate = "July 2025";
    const pwdMatch = html.match(/>H-1B<\/td>\s*<td[^>]*>((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
    if (pwdMatch) pwdDate = pwdMatch[1];

    // Parse PERM Analyst Review
    // HTML structure: <td headers="a">Analyst Review</td><td...>August 2024</td>
    let permDate = "August 2024";
    const permMatch = html.match(/>Analyst Review<\/td>\s*<td[^>]*>((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
    if (permMatch) permDate = permMatch[1];

    // Parse PERM Audit Review
    // HTML structure: <td headers="a">Audit Review</td><td...>December 2024</td>
    let auditDate = "December 2024";
    const auditMatch = html.match(/>Audit Review<\/td>\s*<td[^>]*>((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i)
    if (auditMatch) auditDate = auditMatch[1];

    return {
      pwd: { months: parseMonthsFromDate(pwdDate), currentlyProcessing: pwdDate },
      perm: { months: parseMonthsFromDate(permDate), currentlyProcessing: permDate },
      permAudit: { months: parseMonthsFromDate(auditDate), currentlyProcessing: auditDate },
    };
  } catch (error) {
    console.error("DOL fetch error:", error);
    // Fallback values must match DEFAULT_PROCESSING_TIMES in processing-times.ts
    // to avoid visual jumps when fetch fails after initial render
    // Note: months field is legacy - we now calculate from currentlyProcessing dates
    return {
      pwd: { months: 6, currentlyProcessing: "July 2025" },
      perm: { months: 17, currentlyProcessing: "August 2024" },
      permAudit: { months: 22, currentlyProcessing: "March 2024" },
    };
  }
}

// Visa Bulletin date structure for a single chart
type VisaBulletinChart = {
  eb1: { allOther: string; china: string; india: string };
  eb2: { allOther: string; china: string; india: string };
  eb3: { allOther: string; china: string; india: string };
};

// Default priority dates based on Jan 2026 bulletin
// These are exported so they can be used as initial state to prevent
// timeline jumps/flicker when API data loads
export const DEFAULT_PRIORITY_DATES: VisaBulletinChart = {
  eb1: { allOther: "Current", china: "Feb 2023", india: "Feb 2023" },
  eb2: { allOther: "Apr 2024", china: "Sep 2021", india: "Jul 2013" },
  eb3: { allOther: "Apr 2023", china: "May 2021", india: "Nov 2013" },
};

// Dates for Filing are typically more current (further ahead)
export const DEFAULT_DATES_FOR_FILING: VisaBulletinChart = {
  eb1: { allOther: "Current", china: "Aug 2023", india: "Aug 2023" },
  eb2: { allOther: "Oct 2024", china: "Jan 2022", india: "Dec 2013" },
  eb3: { allOther: "Jul 2023", china: "Jan 2022", india: "Aug 2014" },
};

// Fetch Visa Bulletin - returns BOTH Final Action Dates and Dates for Filing
async function fetchVisaBulletin(): Promise<{
  finalAction: VisaBulletinChart;
  datesForFiling: VisaBulletinChart;
}> {
  // Use exported defaults
  const defaultsFinalAction = DEFAULT_PRIORITY_DATES;
  const defaultsDatesForFiling = DEFAULT_DATES_FOR_FILING;

  try {
    // Get the current month's bulletin
    const now = new Date();
    const monthNames = ["january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december"];
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear();

    const url = `https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin/${year}/visa-bulletin-for-${month}-${year}.html`;

    const response = await fetch(url, {
      headers: { "User-Agent": "Stateside/1.0" },
    });

    if (!response.ok) throw new Error(`Visa Bulletin fetch failed: ${response.status}`);

    const html = await response.text();

    // Parse date from format "01FEB23" or "C" for current
    const parseDate = (text: string): string => {
      const trimmed = text.trim();
      if (trimmed.toUpperCase() === "C") return "Current";
      // Parse "01FEB23" or "15JUL13" format
      const match = trimmed.match(/(\d{2})([A-Z]{3})(\d{2})/i);
      if (match) {
        const months: Record<string, string> = {
          JAN: "Jan", FEB: "Feb", MAR: "Mar", APR: "Apr",
          MAY: "May", JUN: "Jun", JUL: "Jul", AUG: "Aug",
          SEP: "Sep", OCT: "Oct", NOV: "Nov", DEC: "Dec"
        };
        const [, , mon, yr] = match;
        return `${months[mon.toUpperCase()] || mon} 20${yr}`;
      }
      return trimmed;
    };

    // The visa bulletin has TWO employment-based tables:
    // 1. Final Action Dates (first table) - when case will be approved
    // 2. Dates for Filing (second table) - when you can submit I-485
    //
    // We need to find ALL matches and use the first occurrence for Final Action
    // and second occurrence for Dates for Filing

    // Find all EB category rows
    const eb1Matches = Array.from(html.matchAll(/<td>1st<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>/gi));
    const eb2Matches = Array.from(html.matchAll(/<td>2nd<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>/gi));
    const eb3Matches = Array.from(html.matchAll(/<td>3rd<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>/gi));

    // First match = Final Action Dates, Second match = Dates for Filing
    const finalAction: VisaBulletinChart = {
      eb1: {
        allOther: eb1Matches[0] ? parseDate(eb1Matches[0][1]) : defaultsFinalAction.eb1.allOther,
        china: eb1Matches[0] ? parseDate(eb1Matches[0][2]) : defaultsFinalAction.eb1.china,
        india: eb1Matches[0] ? parseDate(eb1Matches[0][3]) : defaultsFinalAction.eb1.india,
      },
      eb2: {
        allOther: eb2Matches[0] ? parseDate(eb2Matches[0][1]) : defaultsFinalAction.eb2.allOther,
        china: eb2Matches[0] ? parseDate(eb2Matches[0][2]) : defaultsFinalAction.eb2.china,
        india: eb2Matches[0] ? parseDate(eb2Matches[0][3]) : defaultsFinalAction.eb2.india,
      },
      eb3: {
        allOther: eb3Matches[0] ? parseDate(eb3Matches[0][1]) : defaultsFinalAction.eb3.allOther,
        china: eb3Matches[0] ? parseDate(eb3Matches[0][2]) : defaultsFinalAction.eb3.china,
        india: eb3Matches[0] ? parseDate(eb3Matches[0][3]) : defaultsFinalAction.eb3.india,
      },
    };

    const datesForFiling: VisaBulletinChart = {
      eb1: {
        allOther: eb1Matches[1] ? parseDate(eb1Matches[1][1]) : defaultsDatesForFiling.eb1.allOther,
        china: eb1Matches[1] ? parseDate(eb1Matches[1][2]) : defaultsDatesForFiling.eb1.china,
        india: eb1Matches[1] ? parseDate(eb1Matches[1][3]) : defaultsDatesForFiling.eb1.india,
      },
      eb2: {
        allOther: eb2Matches[1] ? parseDate(eb2Matches[1][1]) : defaultsDatesForFiling.eb2.allOther,
        china: eb2Matches[1] ? parseDate(eb2Matches[1][2]) : defaultsDatesForFiling.eb2.china,
        india: eb2Matches[1] ? parseDate(eb2Matches[1][3]) : defaultsDatesForFiling.eb2.india,
      },
      eb3: {
        allOther: eb3Matches[1] ? parseDate(eb3Matches[1][1]) : defaultsDatesForFiling.eb3.allOther,
        china: eb3Matches[1] ? parseDate(eb3Matches[1][2]) : defaultsDatesForFiling.eb3.china,
        india: eb3Matches[1] ? parseDate(eb3Matches[1][3]) : defaultsDatesForFiling.eb3.india,
      },
    };

    return { finalAction, datesForFiling };
  } catch (error) {
    console.error("Visa Bulletin fetch error:", error);
    return {
      finalAction: defaultsFinalAction,
      datesForFiling: defaultsDatesForFiling,
    };
  }
}

// Type for USCIS form processing times
type USCISProcessingTimes = Pick<DynamicData["processingTimes"], "i140" | "i485" | "i765" | "i130" | "i129">;

// Fetch USCIS processing times from GitHub database
async function fetchUSCISFromGitHub(): Promise<USCISProcessingTimes> {
  try {
    // Get latest release info
    const releaseResponse = await fetch(
      "https://api.github.com/repos/jzebedee/uscis/releases/latest",
      {
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "Stateside/1.0",
        },
      }
    );

    if (!releaseResponse.ok) throw new Error("GitHub API failed");

    const release = await releaseResponse.json();

    // For now, return conservative estimates based on USCIS published data
    // In production, we would download and parse the SQLite database
    // The database contains detailed per-service-center times

    return {
      i140: { min: 6, max: 9, premiumDays: 15 },
      i485: { min: 10, max: 18 }, // No premium for I-485
      i765: { min: 3, max: 5, premiumDays: 30 },
      i130: { min: 10, max: 16, premiumDays: 15 },
      i129: { min: 2, max: 6, premiumDays: 15 },
    };
  } catch (error) {
    console.error("GitHub USCIS fetch error:", error);
    return {
      i140: { min: 6, max: 9, premiumDays: 15 },
      i485: { min: 10, max: 18 },
      i765: { min: 3, max: 5, premiumDays: 30 },
      i130: { min: 10, max: 16, premiumDays: 15 },
      i129: { min: 2, max: 6, premiumDays: 15 },
    };
  }
}

// Current USCIS fees (as of Jan 2026)
// These are updated less frequently - major fee rules every few years
function getCurrentFees(): DynamicData["fees"] {
  return {
    i140: 715,
    i485: 1440,
    i765: 260,
    i129H1B: 2780, // Includes base + ACWIA + fraud fees
    i907: 2805,
    asylumFee: 600,
    biometrics: 0, // Separate biometrics fee eliminated April 2024
  };
}

// Calculate velocity data for all category/country combinations
function calculateAllVelocityData(): DynamicData["permVelocity"]["velocityByCategory"] {
  return {
    eb1: {
      india: calculateVelocity("eb1", "india"),
      china: calculateVelocity("eb1", "china"),
      other: calculateVelocity("eb1", "other"),
    },
    eb2: {
      india: calculateVelocity("eb2", "india"),
      china: calculateVelocity("eb2", "china"),
      other: calculateVelocity("eb2", "other"),
    },
    eb3: {
      india: calculateVelocity("eb3", "india"),
      china: calculateVelocity("eb3", "china"),
      other: calculateVelocity("eb3", "other"),
    },
  };
}

// Main fetch function - gets all dynamic data
export async function fetchAllDynamicData(): Promise<DynamicData> {
  const now = new Date().toISOString();

  // Fetch all data in parallel
  const [dolData, visaBulletinData, uscisData] = await Promise.all([
    fetchDOLData(),
    fetchVisaBulletin(),
    fetchUSCISFromGitHub(),
  ]);

  // Get PERM statistics and calculate velocity data
  const permStatistics = getPERMStatistics();
  const velocityByCategory = calculateAllVelocityData();

  return {
    lastUpdated: now,
    sources: {
      dol: { url: "https://flag.dol.gov/processingtimes", fetchedAt: now },
      uscis: { url: "https://github.com/jzebedee/uscis", fetchedAt: now },
      visaBulletin: { url: "https://travel.state.gov/visa-bulletin", fetchedAt: now },
    },
    processingTimes: {
      pwd: dolData.pwd,
      perm: dolData.perm,
      permAudit: dolData.permAudit,
      i140: uscisData.i140,
      i485: uscisData.i485,
      i765: uscisData.i765,
      i130: uscisData.i130,
      i129: uscisData.i129,
    },
    // Final Action Dates - when case will be APPROVED
    priorityDates: visaBulletinData.finalAction,
    // Dates for Filing - when you can SUBMIT I-485 (usually more current)
    datesForFiling: visaBulletinData.datesForFiling,
    fees: getCurrentFees(),
    // PERM velocity data for accurate wait time calculations
    permVelocity: {
      statistics: permStatistics,
      velocityByCategory,
      lastUpdated: permStatistics.lastUpdated,
    },
  };
}

// Cache for dynamic data
let cachedData: DynamicData | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

export async function getDynamicData(forceRefresh = false): Promise<DynamicData> {
  const now = Date.now();

  if (!forceRefresh && cachedData && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedData;
  }

  cachedData = await fetchAllDynamicData();
  cacheTimestamp = now;

  return cachedData;
}

export function getCachedDataSync(): DynamicData | null {
  return cachedData;
}
