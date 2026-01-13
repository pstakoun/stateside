import { FilterState, CurrentStatus, Education, Experience, isTNEligible, priorityDateToString, needsPerm } from "./filter-paths";
import visaData from "@/data/visa-paths.json";
import { ProcessingTimes, DEFAULT_PROCESSING_TIMES, formatMonths, calculateMonthsFromDate, calculatePriorityDateWait, getPriorityDateForPath, formatPriorityWait, calculateWaitForExistingPD, calculateWaitForExistingPDWithVelocity, WaitCalculationResult, getVelocityForCategory, calculateNewFilerWait } from "./processing-times";
import { EBCategory } from "./filter-paths";
import { DynamicData } from "./dynamic-data";

// Current processing times (can be updated dynamically)
let currentProcessingTimes: ProcessingTimes = DEFAULT_PROCESSING_TIMES;

// Set processing times (called when cache is refreshed)
export function setProcessingTimes(times: ProcessingTimes): void {
  currentProcessingTimes = times;
}

// Get current processing times
export function getProcessingTimes(): ProcessingTimes {
  return currentProcessingTimes;
}

// Get dynamic duration for a specific stage based on current processing times
// IMPORTANT: We calculate months from the "currentlyProcessing" date string
// rather than using pre-computed estimatedMonths. This ensures consistency
// between initial render (with defaults) and after API fetch (with live data),
// preventing visual jumps in the timeline.
function getDynamicDuration(nodeId: string): Duration | null {
  const times = currentProcessingTimes;

  switch (nodeId) {
    case "pwd":
      // PWD: calculate months from the "currently processing" date
      // This avoids inconsistency between hardcoded defaults and live-calculated values
      const pwdMonths = calculateMonthsFromDate(times.dol.pwd.currentlyProcessing);
      return {
        min: pwdMonths * 0.8 / 12,
        max: (pwdMonths + 1) / 12,
        display: `${pwdMonths}-${pwdMonths + 1} mo`,
      };

    case "perm":
      // PERM: calculate months from the "currently processing" date
      // This ensures the display matches regardless of data source (defaults vs live)
      const permMonths = calculateMonthsFromDate(times.dol.perm.analystReview.currentlyProcessing);
      return {
        min: Math.max(permMonths - 2, 6) / 12,
        max: (permMonths + 2) / 12,
        display: `${Math.max(permMonths - 2, 6)}-${permMonths + 2} mo`,
      };

    case "i140":
    case "eb1":
    case "eb2niw":
      // I-140: use USCIS data, show premium processing option
      const i140Data = times.uscis["I-140"];
      if (i140Data && i140Data.length > 0) {
        // Find regular and premium times
        const regular = i140Data.find(t => t.serviceCenter !== "Premium");
        const premium = i140Data.find(t => t.serviceCenter === "Premium");

        const minMonths = premium?.processingTime.min ?? 0.5;
        const maxMonths = regular?.processingTime.max ?? 9;

        return {
          min: minMonths / 12,
          max: maxMonths / 12,
          display: minMonths < 1 ? `${Math.round(minMonths * 30)}d-${maxMonths}mo` : formatMonths(minMonths, maxMonths),
        };
      }
      break;

    case "i485":
      // I-485: use USCIS data
      const i485Data = times.uscis["I-485"];
      if (i485Data && i485Data.length > 0) {
        const avgMin = i485Data.reduce((sum, t) => sum + t.processingTime.min, 0) / i485Data.length;
        const avgMax = i485Data.reduce((sum, t) => sum + t.processingTime.max, 0) / i485Data.length;

        return {
          min: avgMin / 12,
          max: avgMax / 12,
          display: formatMonths(avgMin, avgMax),
        };
      }
      break;

    default:
      return null;
  }

  return null;
}

// Duration range in years
export interface Duration {
  min: number;
  max: number;
  display?: string;
}

// A stage in a status path (work authorization)
export interface StatusStage {
  nodeId: string;
  duration: Duration;
  note?: string;
}

// A stage in a GC method (green card filing)
export interface GCStage {
  nodeId: string;
  duration: Duration;
  concurrent?: boolean; // runs concurrently with previous stage
  note?: string;
}

// Requirements for a path
export interface PathRequirements {
  minEducation?: Education;
  maxEducation?: Education; // e.g., student_bachelors shouldn't show if you already have a master's
  minExperience?: Experience;
  hasExtraordinaryAbility?: boolean;
  isOutstandingResearcher?: boolean;
  isExecutive?: boolean;
  isMarried?: boolean;
  hasInvestment?: boolean;
}

// Status path definition
export interface StatusPath {
  id: string;
  name: string;
  description: string;
  validFromStatuses: CurrentStatus[];
  requirements: PathRequirements;
  stages: StatusStage[];
  permStartOffset: number | null; // when PERM can start (years from status start), null = no PERM
  grantsEducation?: Education; // what education this path grants (for student paths)
}

// GC method definition
export interface GCMethod {
  id: string;
  name: string;
  requiresPerm: boolean;
  stages: GCStage[];
  requirements: PathRequirements;
  fixedCategory?: string; // if set, don't compute category
}

// Composed path for rendering
export interface ComposedPath {
  id: string;
  name: string;
  description: string;
  gcCategory: string;
  totalYears: Duration;
  stages: ComposedStage[];
  estimatedCost: number;
  hasLottery: boolean;
  isSelfPetition: boolean;
}

export interface ComposedStage {
  nodeId: string;
  durationYears: Duration;
  track: "status" | "gc";
  startYear: number;
  note?: string;
  isConcurrent?: boolean; // true if this stage runs concurrently with the previous stage
  isPriorityWait?: boolean; // true if this is a priority date wait stage
  priorityDateStr?: string; // the priority date string (e.g., "Jul 2013")
  // Velocity data for priority date wait stages
  velocityInfo?: {
    bulletinAdvancementMonthsPerYear: number;
    velocityRatio: number;
    explanation: string;
    rangeMin: number;
    rangeMax: number;
    confidence: number;
  };
}

// Education ranking for comparisons
const EDUCATION_RANK: Record<Education, number> = {
  highschool: 0,
  bachelors: 1,
  masters: 2,
  phd: 3,
};

// Convert GC category string (e.g., "EB-2", "EB-3") to EBCategory type
function gcCategoryToEBCategory(gcCategory: string): EBCategory | undefined {
  const normalized = gcCategory.toLowerCase().replace(/[- ]/g, "");
  if (normalized.includes("eb1")) return "eb1";
  if (normalized.includes("eb2")) return "eb2";
  if (normalized.includes("eb3")) return "eb3";
  return undefined; // Marriage-based, EB-5, etc.
}

const EXPERIENCE_RANK: Record<Experience, number> = {
  lt2: 0,
  "2to5": 1,
  gt5: 2,
};

// ============== STATUS PATHS ==============

export const STATUS_PATHS: StatusPath[] = [
  {
    id: "student_masters",
    name: "Student → Master's",
    description: "Get a US Master's degree to qualify for EB-2. Work on OPT while pursuing green card",
    validFromStatuses: ["canada", "tn", "h1b", "f1", "opt", "other"],
    requirements: {
      minEducation: "bachelors",
      maxEducation: "bachelors",
    },
    stages: [
      { nodeId: "f1", duration: { min: 1.5, max: 2, display: "1.5-2 yr" }, note: "Master's program" },
      { nodeId: "opt", duration: { min: 1, max: 3, display: "1-3 yr" }, note: "STEM: up to 3 years" },
    ],
    permStartOffset: 1.5,
    grantsEducation: "masters",
  },
  {
    id: "student_phd",
    name: "Student → PhD",
    description: "Get a US PhD. Strong for NIW/EB-1A self-petition. Work on OPT while pursuing green card",
    validFromStatuses: ["canada", "tn", "h1b", "f1", "opt", "other"],
    requirements: {
      minEducation: "bachelors",
      maxEducation: "masters",
    },
    stages: [
      { nodeId: "f1", duration: { min: 4, max: 6, display: "4-6 yr" }, note: "PhD program" },
      { nodeId: "opt", duration: { min: 1, max: 3, display: "1-3 yr" }, note: "STEM: up to 3 years" },
    ],
    permStartOffset: 4,
    grantsEducation: "phd",
  },
  {
    id: "student_bachelors",
    name: "Student → Bachelor's",
    description: "Get a US Bachelor's degree, then work on OPT while pursuing green card",
    validFromStatuses: ["canada", "f1"],
    requirements: {
      maxEducation: "highschool",
    },
    stages: [
      { nodeId: "f1", duration: { min: 4, max: 4, display: "4 yr" }, note: "Bachelor's program" },
      { nodeId: "opt", duration: { min: 1, max: 3, display: "1-3 yr" }, note: "STEM: up to 3 years" },
    ],
    permStartOffset: 4,
    grantsEducation: "bachelors",
  },
  {
    id: "tn_direct",
    name: "TN Professional",
    description: "TN visa for USMCA professionals. Canadians: apply at border (same day) or via I-129 change of status",
    validFromStatuses: ["canada", "tn", "h1b", "f1", "opt"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "tn", duration: { min: 2, max: 3, display: "2-3 yr" }, note: "Renewable indefinitely" },
    ],
    permStartOffset: 0, // Can start PERM immediately on TN (common practice)
  },
  {
    id: "opt_h1b",
    name: "OPT → H-1B",
    description: "Transition from OPT to H-1B via lottery while pursuing green card",
    validFromStatuses: ["f1", "opt"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "opt", duration: { min: 1, max: 1.5, display: "1-1.5 yr" } },
      { nodeId: "h1b", duration: { min: 1, max: 2, display: "1-2 yr" }, note: "If lottery selected" },
    ],
    permStartOffset: 0,
  },
  {
    id: "h1b_direct",
    name: "H-1B Direct",
    description: "Continue on H-1B status while pursuing green card",
    validFromStatuses: ["h1b"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "h1b", duration: { min: 1, max: 6, display: "1-6 yr" } },
    ],
    permStartOffset: 0,
  },
  {
    id: "opt_to_tn",
    name: "OPT → TN",
    description: "Use OPT initially, then get TN at border (requires quick trip to Canada). No lottery required",
    validFromStatuses: ["f1", "opt"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "opt", duration: { min: 0.5, max: 1, display: "6-12 mo" }, note: "Initial work authorization" },
      { nodeId: "tn", duration: { min: 2, max: 3, display: "2-3 yr" }, note: "Get TN at border" },
    ],
    permStartOffset: 0, // Can start PERM immediately on TN (common practice)
  },
  {
    id: "tn_to_h1b",
    name: "TN → H-1B",
    description: "Start on TN, then switch to H-1B. H-1B allows dual intent for green card",
    validFromStatuses: ["canada", "tn"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "tn", duration: { min: 1, max: 2, display: "1-2 yr" }, note: "Initial TN status" },
      { nodeId: "h1b", duration: { min: 1, max: 3, display: "1-3 yr" }, note: "H-1B via lottery" },
    ],
    permStartOffset: 0,
  },
  {
    id: "l1a",
    name: "L-1A Executive",
    description: "Intracompany transfer as executive/manager, then EB-1C green card",
    validFromStatuses: ["canada", "other"],
    requirements: {
      isExecutive: true,
    },
    stages: [
      { nodeId: "l1a", duration: { min: 1, max: 2, display: "1-2 yr" }, note: "Establish US role" },
    ],
    permStartOffset: null,
  },
  {
    id: "l1b",
    name: "L-1B Specialized",
    description: "Intracompany transfer with specialized knowledge. Requires PERM for green card",
    validFromStatuses: ["canada", "other"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "l1b", duration: { min: 1, max: 5, display: "1-5 yr" }, note: "5-year max stay" },
    ],
    permStartOffset: 0.5,
  },
  {
    id: "o1",
    name: "O-1 Extraordinary",
    description: "Work visa for extraordinary ability. Strong path to EB-1A green card",
    validFromStatuses: ["canada", "tn", "h1b", "opt", "other"],
    requirements: {
      hasExtraordinaryAbility: true,
    },
    stages: [
      { nodeId: "o1", duration: { min: 1, max: 3, display: "1-3 yr" }, note: "Renewable" },
    ],
    permStartOffset: null, // O-1 holders typically use EB-1A (no PERM)
  },
  {
    id: "none",
    name: "Direct Filing",
    description: "File directly for green card without employer sponsorship",
    validFromStatuses: ["canada", "tn", "h1b", "opt", "f1", "other"],
    requirements: {},
    stages: [],
    permStartOffset: null,
  },
];

// ============== GC METHODS ==============

export const GC_METHODS: GCMethod[] = [
  // Direct I-485 filing for users with approved I-140 (no new PERM needed)
  {
    id: "direct_i485",
    name: "Direct I-485",
    requiresPerm: false,
    stages: [
      { nodeId: "i485", duration: { min: 0.88, max: 1.5, display: "10-18 mo" }, note: "Using existing approved I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "" } },
    ],
    requirements: {
      // No special requirements - this is for users who already have approved I-140
    },
    fixedCategory: undefined, // Will use existing I-140 category
  },
  {
    id: "perm_route",
    name: "PERM",
    requiresPerm: true,
    stages: [
      // Real DOL data as of Dec 2025: PWD ~5-6mo, PERM analyst review ~16mo
      { nodeId: "pwd", duration: { min: 0.42, max: 0.58, display: "5-7 mo" } },
      { nodeId: "recruit", duration: { min: 0.17, max: 0.25, display: "2-3 mo" } },
      { nodeId: "perm", duration: { min: 1.17, max: 1.5, display: "14-18 mo" } },
      { nodeId: "i140", duration: { min: 0.04, max: 0.75, display: "15d-9mo" }, note: "15 business days w/ premium" },
      { nodeId: "i485", duration: { min: 0.88, max: 1.5, display: "10-18 mo" }, concurrent: true },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "" } },
    ],
    requirements: {
      minEducation: "bachelors",
    },
  },
  {
    id: "niw",
    name: "EB-2 NIW",
    requiresPerm: false,
    stages: [
      { nodeId: "eb2niw", duration: { min: 0.15, max: 0.75, display: "2-9 mo" }, note: "45 business days (~9 wks) w/ premium" },
      { nodeId: "i485", duration: { min: 0.88, max: 1.5, display: "10-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "" } },
    ],
    requirements: {
      minEducation: "masters", // NIW requires advanced degree (or bachelor's + 5yr)
    },
    fixedCategory: "EB-2 NIW",
  },
  {
    id: "eb1a",
    name: "EB-1A",
    requiresPerm: false,
    stages: [
      { nodeId: "eb1", duration: { min: 0.04, max: 0.75, display: "15d-9mo" }, note: "15 business days w/ premium" },
      { nodeId: "i485", duration: { min: 0.88, max: 1.5, display: "10-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "" } },
    ],
    requirements: {
      hasExtraordinaryAbility: true,
    },
    fixedCategory: "EB-1A",
  },
  {
    id: "eb1b",
    name: "EB-1B",
    requiresPerm: false,
    stages: [
      { nodeId: "eb1", duration: { min: 0.04, max: 0.75, display: "15d-9mo" }, note: "15 business days w/ premium" },
      { nodeId: "i485", duration: { min: 0.88, max: 1.5, display: "10-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "" } },
    ],
    requirements: {
      isOutstandingResearcher: true,
      minEducation: "masters", // Advanced degree or equivalent research experience
    },
    fixedCategory: "EB-1B",
  },
  {
    id: "eb1c",
    name: "EB-1C",
    requiresPerm: false,
    stages: [
      { nodeId: "eb1", duration: { min: 0.04, max: 0.75, display: "15d-9mo" }, note: "15 business days w/ premium" },
      { nodeId: "i485", duration: { min: 0.88, max: 1.5, display: "10-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "" } },
    ],
    requirements: {
      isExecutive: true,
    },
    fixedCategory: "EB-1C",
  },
  {
    id: "marriage",
    name: "Marriage",
    requiresPerm: false,
    stages: [
      { nodeId: "marriage", duration: { min: 0.7, max: 1.2, display: "8-14 mo" }, note: "I-130 + I-485 concurrent" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "Done!" } },
    ],
    requirements: {
      isMarried: true,
      // No education requirement
    },
    fixedCategory: "Marriage-based",
  },
  {
    id: "eb5",
    name: "EB-5",
    requiresPerm: false,
    stages: [
      { nodeId: "eb5", duration: { min: 2, max: 3, display: "2-3 yr" }, note: "I-526E petition" },
      { nodeId: "i485", duration: { min: 1, max: 2, display: "1-2 yr" }, note: "Conditional GC" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "Done!" } },
    ],
    requirements: {
      hasInvestment: true,
      // No education requirement
    },
    fixedCategory: "EB-5",
  },
];

// ============== HELPER FUNCTIONS ==============

/**
 * Check if user meets education requirement
 */
function meetsEducationRequirement(
  userEducation: Education,
  minEducation?: Education,
  maxEducation?: Education
): boolean {
  const userRank = EDUCATION_RANK[userEducation];

  if (minEducation !== undefined) {
    if (userRank < EDUCATION_RANK[minEducation]) {
      return false;
    }
  }

  if (maxEducation !== undefined) {
    if (userRank > EDUCATION_RANK[maxEducation]) {
      return false;
    }
  }

  return true;
}

/**
 * Check if user meets all requirements for a path/method
 */
function meetsRequirements(
  filters: FilterState,
  requirements: PathRequirements,
  allowBachelorsPlus5yr: boolean = false
): boolean {
  // Check education requirements
  if (!meetsEducationRequirement(filters.education, requirements.minEducation, requirements.maxEducation)) {
    // Special case: bachelor's + 5yr experience can substitute for master's
    if (allowBachelorsPlus5yr &&
        requirements.minEducation === "masters" &&
        filters.education === "bachelors" &&
        filters.experience === "gt5") {
      // Allow this case
    } else {
      return false;
    }
  }

  // Check experience requirement
  if (requirements.minExperience !== undefined) {
    if (EXPERIENCE_RANK[filters.experience] < EXPERIENCE_RANK[requirements.minExperience]) {
      return false;
    }
  }

  // Check special qualifications
  if (requirements.hasExtraordinaryAbility && !filters.hasExtraordinaryAbility) return false;
  if (requirements.isOutstandingResearcher && !filters.isOutstandingResearcher) return false;
  if (requirements.isExecutive && !filters.isExecutive) return false;
  if (requirements.isMarried && !filters.isMarriedToUSCitizen) return false;
  if (requirements.hasInvestment && !filters.hasInvestmentCapital) return false;

  return true;
}

/**
 * Check if user's current status allows starting this path
 */
function isStatusPathValidForUser(statusPath: StatusPath, filters: FilterState): boolean {
  // Check if current status is valid
  if (!statusPath.validFromStatuses.includes(filters.currentStatus)) {
    return false;
  }

  // Check if user meets requirements
  if (!meetsRequirements(filters, statusPath.requirements)) {
    return false;
  }

  // TN visa paths require Canadian or Mexican citizenship
  const tnPathIds = ["tn_direct", "opt_to_tn", "tn_to_h1b"];
  if (tnPathIds.includes(statusPath.id) && !isTNEligible(filters)) {
    return false;
  }

  return true;
}

/**
 * Check if a GC method can be used with a status path
 */
function isCompatible(statusPath: StatusPath, gcMethod: GCMethod, filters: FilterState): boolean {
  // Special case: if user has approved I-140 and is NOT switching employers,
  // they don't need PERM again - they can go directly to I-485
  const userNeedsPerm = needsPerm(filters);
  
  // If PERM method but user doesn't need PERM, suggest direct filing path
  if (gcMethod.requiresPerm && !userNeedsPerm && statusPath.id !== "none") {
    // They can skip PERM, so prefer the "none"/direct filing path
    return false;
  }
  
  // PERM route requires a status path that supports it
  if (gcMethod.requiresPerm && statusPath.permStartOffset === null) {
    return false;
  }

  // EB-1C only works with L-1A
  if (gcMethod.id === "eb1c" && statusPath.id !== "l1a") {
    return false;
  }

  // PERM route requires actual work status (not "none"/direct filing)
  // UNLESS user has approved I-140 and doesn't need new PERM
  if (gcMethod.requiresPerm && statusPath.id === "none" && userNeedsPerm) {
    return false;
  }

  // For student paths, compute effective education after completing the degree
  let effectiveEducation = filters.education;
  if (statusPath.grantsEducation) {
    // Student path grants a degree, use that for GC method requirements
    effectiveEducation = statusPath.grantsEducation;
  }

  // Check if GC method requirements are met (with effective education)
  const effectiveFilters = { ...filters, education: effectiveEducation };
  if (!meetsRequirements(effectiveFilters, gcMethod.requirements, true)) {
    return false;
  }

  return true;
}

/**
 * Compute the GC category (EB-2 or EB-3) based on user qualifications
 */
export function computeGCCategory(
  filters: FilterState,
  gcMethod: GCMethod,
  statusPath: StatusPath
): string {
  // If method has a fixed category, use it
  if (gcMethod.fixedCategory) {
    return gcMethod.fixedCategory;
  }

  // For direct I-485 filing (user has approved I-140), use their existing category
  if (gcMethod.id === "direct_i485" && filters.existingPriorityDateCategory) {
    const categoryMap: Record<string, string> = {
      eb1: "EB-1",
      eb2: "EB-2",
      eb3: "EB-3",
    };
    return categoryMap[filters.existingPriorityDateCategory] || "EB-2";
  }

  // For student paths, use the education the path grants
  let effectiveEducation = filters.education;
  if (statusPath.grantsEducation) {
    effectiveEducation = statusPath.grantsEducation;
  }

  // PERM route: EB-2 or EB-3 based on education
  if (effectiveEducation === "masters" || effectiveEducation === "phd") {
    return "EB-2";
  }
  if (effectiveEducation === "bachelors" && filters.experience === "gt5") {
    return "EB-2"; // Bachelor's + 5yr = Master's equivalent
  }
  return "EB-3";
}

/**
 * Compose a single path from status path + GC method
 */
function composePath(
  statusPath: StatusPath,
  gcMethod: GCMethod,
  gcCategory: string,
  filters: FilterState,
  priorityDates?: DynamicData["priorityDates"],
  datesForFiling?: DynamicData["datesForFiling"]
): ComposedPath {
  const stages: ComposedStage[] = [];
  let statusEndYear = 0;

  // Add status stages (work authorization track)
  for (const stage of statusPath.stages) {
    // Adjust OPT duration based on STEM status
    let duration = stage.duration;
    let note = stage.note;
    if (stage.nodeId === "opt") {
      if (filters.isStem) {
        // STEM OPT: up to 3 years total (1 year + 24 month extension)
        duration = { min: 1, max: 3, display: "1-3 yr" };
        note = "STEM OPT (3 years)";
      } else {
        // Regular OPT: 1 year only
        duration = { min: 1, max: 1, display: "1 yr" };
        note = "Standard OPT (1 year)";
      }
    }

    stages.push({
      nodeId: stage.nodeId,
      durationYears: {
        min: duration.min,
        max: duration.max,
        display: duration.display || `${duration.min}-${duration.max} yr`,
      },
      track: "status",
      startYear: statusEndYear,
      note,
    });
    statusEndYear += duration.max;
  }

  // Calculate when GC process starts
  // For PERM-based paths: can start PERM while working (permStartOffset)
  // For self-petition paths (NIW, EB-1A, EB-1B): need the degree FIRST
  //   - If student path grants a degree, GC filing starts AFTER degree is obtained
  //   - The degree is obtained after F-1 completes (before OPT)
  let gcStartYear: number;
  
  if (gcMethod.requiresPerm) {
    // PERM can start while working, even before degree complete in some cases
    gcStartYear = statusPath.permStartOffset ?? 0;
  } else if (statusPath.grantsEducation) {
    // Self-petition (NIW, EB-1A, EB-1B) with student path:
    // MUST have the degree first to qualify, so start after F-1 completes
    const f1Stage = statusPath.stages.find(s => s.nodeId === "f1");
    if (f1Stage) {
      // Find when F-1 ends (sum of durations up to and including F-1)
      const f1Index = statusPath.stages.indexOf(f1Stage);
      gcStartYear = statusPath.stages
        .slice(0, f1Index + 1)
        .reduce((sum, s) => sum + s.duration.max, 0);
    } else {
      // No F-1 stage, start after all status stages
      gcStartYear = statusEndYear;
    }
  } else {
    // Self-petition without student path (already have degree):
    // Can file immediately
    gcStartYear = statusPath.permStartOffset ?? 0;
  }

  // Add GC stages (green card track)
  // Track both the sequential position AND the actual end time of all stages
  let gcSequentialYear = gcStartYear;
  let gcMaxEndYear = gcStartYear;

  for (let i = 0; i < gcMethod.stages.length; i++) {
    const stage = gcMethod.stages[i];
    const isConcurrent = stage.concurrent && i > 0;

    // Get dynamic duration if available, otherwise use default
    const dynamicDuration = getDynamicDuration(stage.nodeId);
    const duration = dynamicDuration ?? stage.duration;

    // For concurrent stages, start at same time as previous stage
    // For sequential stages, start after the latest end time
    const stageStartYear = isConcurrent
      ? stages[stages.length - 1].startYear
      : gcSequentialYear;

    const stageEndYear = stageStartYear + duration.max;

    stages.push({
      nodeId: stage.nodeId,
      durationYears: {
        min: duration.min,
        max: duration.max,
        display: duration.display || `${duration.min}-${duration.max} yr`,
      },
      track: "gc",
      startYear: stageStartYear,
      note: stage.note,
      isConcurrent,
    });

    // Update sequential position:
    // - For non-concurrent: next stage starts after this one
    // - For concurrent: next sequential stage must still wait for this to complete
    gcSequentialYear = Math.max(gcSequentialYear, stageEndYear);

    // Track the maximum end time
    gcMaxEndYear = Math.max(gcMaxEndYear, stageEndYear);
  }

  // Check for priority date backlog and determine filing/approval timing
  // This applies to employment-based categories (EB-1, EB-2, EB-3)
  //
  // IMPORTANT: The Visa Bulletin has TWO charts:
  // 1. "Dates for Filing" (Chart B) - determines when you can SUBMIT your I-485
  //    - Filing early gives benefits: EAD, Advance Parole, AC21 portability after 180 days
  // 2. "Final Action Dates" (Chart A) - determines when your case will be APPROVED
  //    - Your green card is issued when your PD is current here
  //
  // Timeline: I-140 → [Filing Wait] → I-485 Filed → [Approval Wait] → GC
  let filingWaitMonths = 0;      // Wait until can FILE I-485 (Dates for Filing)
  let approvalWaitMonths = 0;    // Wait until I-485 APPROVED (Final Action)
  let filingDateStr = "Current";
  let approvalDateStr = "Current";
  let canFileConcurrently = true;
  let filingVelocityInfo: ComposedStage["velocityInfo"] | undefined;
  let approvalVelocityInfo: ComposedStage["velocityInfo"] | undefined;

  if (!gcMethod.fixedCategory?.includes("Marriage") && !gcMethod.fixedCategory?.includes("EB-5")) {
    // Get both charts
    const filingDatesChart = datesForFiling || priorityDates;
    const approvalDatesChart = priorityDates;

    // Convert gcCategory to EBCategory for velocity calculations
    const ebCategory = gcCategoryToEBCategory(gcCategory);

    if (filters.existingPriorityDate) {
      // User has an existing priority date (either from current employer I-140 or ported from previous)
      // Use this for wait calculation regardless of whether they need new PERM
      const userPDStr = priorityDateToString(filters.existingPriorityDate);

      // Calculate FILING wait (Dates for Filing chart)
      if (filingDatesChart) {
        filingDateStr = getPriorityDateForPath(filingDatesChart, gcCategory, filters.countryOfBirth);
        const filingResult = calculateWaitForExistingPDWithVelocity(
          filters.existingPriorityDate,
          filingDateStr,
          filters.countryOfBirth,
          ebCategory
        );
        filingWaitMonths = filingResult.estimatedMonths;
        canFileConcurrently = filingWaitMonths === 0;
        filingVelocityInfo = {
          bulletinAdvancementMonthsPerYear: filingResult.velocityData.bulletinAdvancementMonthsPerYear,
          velocityRatio: filingResult.velocityData.velocityRatio,
          explanation: filingResult.velocityData.explanation,
          rangeMin: filingResult.rangeMin,
          rangeMax: filingResult.rangeMax,
          confidence: filingResult.confidence,
        };
      }

      // Calculate APPROVAL wait (Final Action chart)
      if (approvalDatesChart) {
        approvalDateStr = getPriorityDateForPath(approvalDatesChart, gcCategory, filters.countryOfBirth);
        const approvalResult = calculateWaitForExistingPDWithVelocity(
          filters.existingPriorityDate,
          approvalDateStr,
          filters.countryOfBirth,
          ebCategory
        );
        approvalWaitMonths = approvalResult.estimatedMonths;
        approvalVelocityInfo = {
          bulletinAdvancementMonthsPerYear: approvalResult.velocityData.bulletinAdvancementMonthsPerYear,
          velocityRatio: approvalResult.velocityData.velocityRatio,
          explanation: approvalResult.velocityData.explanation,
          rangeMin: approvalResult.rangeMin,
          rangeMax: approvalResult.rangeMax,
          confidence: approvalResult.confidence,
        };
      }
    } else {
      // No existing PD - new filer (PD will be ~today when I-140 approved)
      
      // Calculate FILING wait for new filer
      if (filingDatesChart) {
        filingDateStr = getPriorityDateForPath(filingDatesChart, gcCategory, filters.countryOfBirth);
        const filingResult = calculateNewFilerWait(filingDateStr, filters.countryOfBirth, ebCategory);
        filingWaitMonths = filingResult.estimatedMonths;
        canFileConcurrently = filingWaitMonths === 0;
        filingVelocityInfo = {
          bulletinAdvancementMonthsPerYear: filingResult.velocityData.bulletinAdvancementMonthsPerYear,
          velocityRatio: filingResult.velocityData.velocityRatio,
          explanation: filingResult.velocityData.explanation,
          rangeMin: filingResult.rangeMin,
          rangeMax: filingResult.rangeMax,
          confidence: filingResult.confidence,
        };
      }

      // Calculate APPROVAL wait for new filer
      if (approvalDatesChart) {
        approvalDateStr = getPriorityDateForPath(approvalDatesChart, gcCategory, filters.countryOfBirth);
        const approvalResult = calculateNewFilerWait(approvalDateStr, filters.countryOfBirth, ebCategory);
        approvalWaitMonths = approvalResult.estimatedMonths;
        approvalVelocityInfo = {
          bulletinAdvancementMonthsPerYear: approvalResult.velocityData.bulletinAdvancementMonthsPerYear,
          velocityRatio: approvalResult.velocityData.velocityRatio,
          explanation: approvalResult.velocityData.explanation,
          rangeMin: approvalResult.rangeMin,
          rangeMax: approvalResult.rangeMax,
          confidence: approvalResult.confidence,
        };
      }
    }
  }

  // Handle priority date backlog - show BOTH filing wait and approval wait separately
  //
  // Timeline: I-140 → [Filing Wait] → I-485 (pending, get EAD/AP) → [Approval Wait] → GC
  //
  // Filing Wait: Based on "Dates for Filing" chart - when you can SUBMIT I-485
  // Approval Wait: Based on "Final Action" chart - when I-485 is APPROVED
  //
  // Benefits of filing early (even if approval wait remains):
  // - EAD (work permit) - work for any employer
  // - Advance Parole (travel document)
  // - AC21 Portability after 180 days - can change jobs

  const i140Index = stages.findIndex(s => s.nodeId === "i140" || s.nodeId === "eb1" || s.nodeId === "eb2niw");
  const i485Index = stages.findIndex(s => s.nodeId === "i485");

  if (i140Index >= 0 && i485Index >= 0) {
    const i140Stage = stages[i140Index];
    const i485Stage = stages[i485Index];
    const i485ProcessingTime = i485Stage.durationYears.max; // Normal USCIS processing time
    
    let currentI485Index = i485Index;
    let stagesInserted = 0;

    // STEP 1: Add Filing Wait if needed (Dates for Filing not current)
    if (filingWaitMonths > 0) {
      const filingWaitYears = filingWaitMonths / 12;
      const filingWaitStart = i140Stage.startYear + i140Stage.durationYears.max;
      
      const filingWaitStage: ComposedStage = {
        nodeId: "priority_wait",
        durationYears: {
          min: filingVelocityInfo?.rangeMin ? filingVelocityInfo.rangeMin / 12 : filingWaitYears,
          max: filingVelocityInfo?.rangeMax ? filingVelocityInfo.rangeMax / 12 : filingWaitYears,
          display: formatPriorityWait(filingWaitMonths),
        },
        track: "gc",
        startYear: filingWaitStart,
        note: `Wait for Dates for Filing to reach your PD. Current: ${filingDateStr}`,
        isPriorityWait: true,
        priorityDateStr: filingDateStr,
        velocityInfo: filingVelocityInfo,
      };

      // Insert before I-485
      stages.splice(i485Index, 0, filingWaitStage);
      stagesInserted++;
      currentI485Index = i485Index + stagesInserted;

      // Update I-485 position and status
      const filingWaitMaxDuration = filingWaitStage.durationYears.max;
      stages[currentI485Index].startYear = filingWaitStart + filingWaitMaxDuration;
      stages[currentI485Index].isConcurrent = false;
    }

    // STEP 2: Handle approval wait and update I-485 duration
    // The I-485 pending time = max(USCIS processing time, approval wait after filing)
    // Both happen in parallel, so whichever is longer is the bottleneck
    const additionalApprovalWait = approvalWaitMonths - filingWaitMonths;
    const additionalApprovalWaitYears = additionalApprovalWait / 12;
    
    const i485BaseMinMonths = Math.round(i485Stage.durationYears.min * 12);  // ~10 months
    const i485BaseMaxMonths = Math.round(i485Stage.durationYears.max * 12);  // ~18 months
    
    if (additionalApprovalWait > 0) {
      // There's approval wait after filing
      // I-485 pending time = max(processing, approval wait)
      // The actual time is whichever completes LAST
      const effectiveMinMonths = Math.max(i485BaseMinMonths, Math.round(additionalApprovalWait));
      const effectiveMaxMonths = Math.max(i485BaseMaxMonths, Math.round(additionalApprovalWait));
      
      const effectiveMin = effectiveMinMonths / 12;
      const effectiveMax = effectiveMaxMonths / 12;
      
      // Determine what's shown based on how approval wait affects timeline
      let display: string;
      let note: string;
      
      if (additionalApprovalWait > i485BaseMaxMonths) {
        // Approval wait is the bottleneck - exceeds max processing time
        // Timeline is determined entirely by approval wait
        display = formatPriorityWait(effectiveMaxMonths);
        note = `I-485 pending ${display}: EAD + AP valid, AC21 portability after 180 days. Waiting for Final Action date (${approvalDateStr}).`;
        stages[currentI485Index].velocityInfo = approvalVelocityInfo;
      } else if (additionalApprovalWait > i485BaseMinMonths) {
        // Approval wait raises the minimum but max is still processing time
        // Shows the approval wait is affecting the timeline
        display = `${effectiveMinMonths}-${effectiveMaxMonths} mo`;
        note = `I-485 pending: EAD + AP valid, AC21 portability after 180 days. Min ${Math.round(additionalApprovalWait)} mo for visa availability.`;
      } else {
        // Approval wait is shorter than processing - doesn't affect timeline
        // Processing time is the bottleneck
        display = `${i485BaseMinMonths}-${i485BaseMaxMonths} mo`;
        note = `I-485 pending: EAD + AP valid, AC21 portability after 180 days.`;
      }
      
      stages[currentI485Index].durationYears = {
        min: effectiveMin,
        max: effectiveMax,
        display,
      };
      stages[currentI485Index].note = note;
      
      // Update GC marker position based on new I-485 duration
      const i485NewEndYear = stages[currentI485Index].startYear + effectiveMax;
      gcMaxEndYear = Math.max(gcMaxEndYear, i485NewEndYear);
    } else if (filingWaitMonths > 0) {
      stages[currentI485Index].note = "After Dates for Filing is current";
    } else {
      // No filing wait and no approval wait - both charts current
      stages[currentI485Index].note = "Concurrent filing available - no visa backlog";
    }

    // Update GC marker position to match end of I-485
    const finalI485Stage = stages[currentI485Index];
    const i485EndYear = finalI485Stage.startYear + finalI485Stage.durationYears.max;
    
    for (let i = currentI485Index + 1; i < stages.length; i++) {
      if (stages[i].nodeId === "gc") {
        stages[i].startYear = i485EndYear;
        gcMaxEndYear = Math.max(gcMaxEndYear, i485EndYear);
        break;
      }
    }
  }

  // Calculate total duration - use the actual max end time
  const maxStatusYear = statusEndYear;
  const totalMax = Math.max(maxStatusYear, gcMaxEndYear);

  const minStatusYear = statusPath.stages.reduce((sum, s) => sum + s.duration.min, 0);
  const minGCYear = (statusPath.permStartOffset ?? 0) +
    gcMethod.stages.filter(s => !s.concurrent).reduce((sum, s) => {
      const dynamicDur = getDynamicDuration(s.nodeId);
      return sum + (dynamicDur?.min ?? s.duration.min);
    }, 0) +
    (approvalWaitMonths / 12); // Add priority date wait to minimum (total wait until approval)
  const totalMin = Math.max(minStatusYear, minGCYear);

  // Build path name
  let pathName: string;
  if (gcMethod.id === "direct_i485") {
    pathName = `Direct I-485 (${gcCategory})`;
  } else if (statusPath.id === "none") {
    pathName = `${gcMethod.name} (Direct)`;
  } else if (gcMethod.requiresPerm) {
    pathName = `${statusPath.name} → ${gcCategory}`;
  } else {
    pathName = `${statusPath.name} → ${gcCategory}`;
  }

  // Build description
  let description: string;
  if (gcMethod.id === "direct_i485" && filters.hasApprovedI140) {
    const pdStr = filters.existingPriorityDate 
      ? priorityDateToString(filters.existingPriorityDate)
      : "your existing priority date";
    description = `File I-485 directly using your approved I-140 (PD: ${pdStr}). No new PERM required since staying with same employer.`;
  } else {
    description = statusPath.description;
    if (gcMethod.requiresPerm) {
      const permTiming = statusPath.permStartOffset === 0
        ? "immediately"
        : statusPath.permStartOffset === 0.5
        ? "after 6 months"
        : `at year ${statusPath.permStartOffset}`;
      description += `. Start PERM ${permTiming}.`;
    }
  }

  // Calculate estimated cost from filing fees
  const nodeIds = Array.from(new Set(stages.map(s => s.nodeId)));
  let estimatedCost = 0;
  for (const nodeId of nodeIds) {
    const node = visaData.nodes[nodeId as keyof typeof visaData.nodes];
    if (node && "filings" in node) {
      const filings = node.filings as Array<{ fee: number | string }>;
      for (const filing of filings) {
        const fee = typeof filing.fee === "number" ? filing.fee : parseInt(filing.fee) || 0;
        estimatedCost += fee;
      }
    }
  }

  // Determine path characteristics
  const hasLottery = nodeIds.includes("h1b");
  const isSelfPetition = gcMethod.id === "niw" || gcMethod.id === "eb1a" || gcMethod.id === "marriage" || gcMethod.id === "eb5";

  return {
    id: `${statusPath.id}_${gcMethod.id}`,
    name: pathName,
    description,
    gcCategory,
    totalYears: {
      min: totalMin,
      max: totalMax,
      display: `${totalMin.toFixed(1)}-${totalMax.toFixed(1)} yr`,
    },
    stages,
    estimatedCost,
    hasLottery,
    isSelfPetition,
  };
}

/**
 * Generate all valid paths for the current user filters
 */
export function generatePaths(
  filters: FilterState,
  priorityDates?: DynamicData["priorityDates"],
  datesForFiling?: DynamicData["datesForFiling"]
): ComposedPath[] {
  const paths: ComposedPath[] = [];
  const userNeedsPerm = needsPerm(filters);

  for (const statusPath of STATUS_PATHS) {
    // Skip if user can't start this status path
    if (!isStatusPathValidForUser(statusPath, filters)) continue;

    for (const gcMethod of GC_METHODS) {
      // Special handling for direct_i485 method
      if (gcMethod.id === "direct_i485") {
        // Only show direct I-485 path if user has approved I-140 AND doesn't need new PERM
        if (!filters.hasApprovedI140 || userNeedsPerm) {
          continue;
        }
        // Direct I-485 works with the "none" status path (direct filing)
        if (statusPath.id !== "none") {
          continue;
        }
      }
      
      // Skip PERM routes if user has approved I-140 and doesn't need new PERM
      // (unless they explicitly want to do new PERM for employer switch)
      if (gcMethod.requiresPerm && !userNeedsPerm) {
        continue;
      }

      // Skip if status path and GC method aren't compatible
      if (!isCompatible(statusPath, gcMethod, filters)) continue;

      // Compute GC category
      const gcCategory = computeGCCategory(filters, gcMethod, statusPath);

      // Compose and add the path
      const path = composePath(statusPath, gcMethod, gcCategory, filters, priorityDates, datesForFiling);
      paths.push(path);
    }
  }

  // Risk scores - lower = safer/higher approval rate
  // Regular employer-sponsored PERM is safest, self-petition/extraordinary ability is riskier
  const getRiskScore = (path: ComposedPath): number => {
    const category = path.gcCategory.toLowerCase();
    const hasLottery = path.hasLottery;
    const isSelfPetition = path.isSelfPetition;
    
    // Marriage-based: very high approval if legitimate
    if (category.includes("marriage")) return 1;
    
    // Regular PERM-based EB-2/EB-3: well-established, predictable
    if (!isSelfPetition && (category.includes("eb-2") || category.includes("eb-3"))) {
      return hasLottery ? 3 : 2; // H-1B lottery adds uncertainty
    }
    
    // EB-1C (multinational executive): employer-sponsored but specific requirements
    if (category.includes("eb-1c")) return 4;
    
    // EB-1B (outstanding researcher): employer-sponsored but higher bar
    if (category.includes("eb-1b")) return 5;
    
    // EB-2 NIW: self-petition, must prove national interest
    if (category.includes("niw")) return 6;
    
    // EB-1A: self-petition, highest bar (extraordinary ability)
    if (category.includes("eb-1a")) return 7;
    
    // EB-5: requires significant investment, different risk profile
    if (category.includes("eb-5")) return 8;
    
    return 5; // Default middle risk
  };

  // Sort by: 1) fastest GC, 2) lowest risk, 3) fewest steps
  paths.sort((a, b) => {
    // Get GC end time (when Green Card is obtained)
    const aGcEnd = a.stages.find(s => s.nodeId === "gc")?.startYear || a.totalYears.max;
    const bGcEnd = b.stages.find(s => s.nodeId === "gc")?.startYear || b.totalYears.max;
    
    // Primary: shortest time to GC
    if (Math.abs(aGcEnd - bGcEnd) > 0.5) { // Allow 6-month tolerance for "ties"
      return aGcEnd - bGcEnd;
    }
    
    // Secondary: lowest risk / highest approval rate
    const aRisk = getRiskScore(a);
    const bRisk = getRiskScore(b);
    if (aRisk !== bRisk) {
      return aRisk - bRisk;
    }
    
    // Tertiary: fewest steps (simplicity)
    const aSteps = a.stages.filter(s => s.nodeId !== "gc" && !s.isPriorityWait).length;
    const bSteps = b.stages.filter(s => s.nodeId !== "gc" && !s.isPriorityWait).length;
    return aSteps - bSteps;
  });

  return paths;
}
