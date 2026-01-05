import { FilterState, CurrentStatus, Education, Experience } from "./filter-paths";

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
  isExecutive?: boolean;
  isMarried?: boolean;
  hasInvestment?: boolean;
}

// Status path definition
export interface StatusPath {
  id: string;
  name: string;
  emoji: string;
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
  emoji: string;
  description: string;
  gcCategory: string;
  totalYears: Duration;
  stages: ComposedStage[];
}

export interface ComposedStage {
  nodeId: string;
  durationYears: Duration;
  track: "status" | "gc";
  startYear: number;
  note?: string;
  isConcurrent?: boolean; // true if this stage runs concurrently with the previous stage
}

// Education ranking for comparisons
const EDUCATION_RANK: Record<Education, number> = {
  highschool: 0,
  bachelors: 1,
  masters: 2,
  phd: 3,
};

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
    emoji: "",
    description: "Get a US Master's degree to qualify for EB-2. Work on OPT while pursuing green card",
    validFromStatuses: ["canada", "tn", "h1b"],
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
    emoji: "",
    description: "Get a US PhD. Strong for NIW/EB-1A self-petition. Work on OPT while pursuing green card",
    validFromStatuses: ["canada", "tn", "h1b"],
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
    emoji: "",
    description: "Get a US Bachelor's degree, then work on OPT while pursuing green card",
    validFromStatuses: ["canada"],
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
    emoji: "",
    description: "TN visa for professionals in eligible USMCA occupations",
    validFromStatuses: ["canada", "tn", "h1b"],
    requirements: {
      minEducation: "bachelors",
    },
    stages: [
      { nodeId: "tn", duration: { min: 2, max: 3, display: "2-3 yr" }, note: "Renewable indefinitely" },
    ],
    permStartOffset: 0.5,
  },
  {
    id: "opt_h1b",
    name: "OPT → H-1B",
    emoji: "",
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
    emoji: "",
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
    id: "l1a",
    name: "L-1A Executive",
    emoji: "",
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
    id: "none",
    name: "Direct Filing",
    emoji: "",
    description: "File directly for green card without employer sponsorship",
    validFromStatuses: ["canada", "tn", "h1b", "opt", "f1", "other"],
    requirements: {},
    stages: [],
    permStartOffset: null,
  },
];

// ============== GC METHODS ==============

export const GC_METHODS: GCMethod[] = [
  {
    id: "perm_route",
    name: "PERM",
    requiresPerm: true,
    stages: [
      { nodeId: "pwd", duration: { min: 0.33, max: 0.5, display: "4-6 mo" } },
      { nodeId: "recruit", duration: { min: 0.17, max: 0.25, display: "2-3 mo" } },
      { nodeId: "perm", duration: { min: 0.5, max: 1, display: "6-12 mo" } },
      { nodeId: "i140", duration: { min: 0.04, max: 0.5, display: "15d-6mo" } },
      { nodeId: "i485", duration: { min: 0.5, max: 1.5, display: "6-18 mo" }, concurrent: true },
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
      { nodeId: "eb2niw", duration: { min: 0.5, max: 1, display: "6-12 mo" }, note: "I-140 NIW (45 days w/ premium)" },
      { nodeId: "i485", duration: { min: 0.5, max: 1.5, display: "6-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "Done!" } },
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
      { nodeId: "eb1", duration: { min: 0.04, max: 0.5, display: "15d-6mo" }, note: "I-140 EB-1A (15 days w/ premium)" },
      { nodeId: "i485", duration: { min: 0.5, max: 1.5, display: "6-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "Done!" } },
    ],
    requirements: {
      hasExtraordinaryAbility: true,
      // No education requirement - based purely on extraordinary ability
    },
    fixedCategory: "EB-1A",
  },
  {
    id: "eb1c",
    name: "EB-1C",
    requiresPerm: false,
    stages: [
      { nodeId: "eb1", duration: { min: 0.04, max: 0.5, display: "15d-6mo" }, note: "EB-1C petition" },
      { nodeId: "i485", duration: { min: 0.5, max: 1.5, display: "6-18 mo" }, concurrent: true, note: "Concurrent with I-140" },
      { nodeId: "gc", duration: { min: 0, max: 0, display: "Done!" } },
    ],
    requirements: {
      isExecutive: true,
      // No education requirement - based on executive/manager role
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

  return true;
}

/**
 * Check if a GC method can be used with a status path
 */
function isCompatible(statusPath: StatusPath, gcMethod: GCMethod, filters: FilterState): boolean {
  // PERM route requires a status path that supports it
  if (gcMethod.requiresPerm && statusPath.permStartOffset === null) {
    return false;
  }

  // EB-1C only works with L-1A
  if (gcMethod.id === "eb1c" && statusPath.id !== "l1a") {
    return false;
  }

  // PERM route requires actual work status (not "none"/direct filing)
  if (gcMethod.requiresPerm && statusPath.id === "none") {
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
  filters: FilterState
): ComposedPath {
  const stages: ComposedStage[] = [];
  let statusEndYear = 0;

  // Add status stages (work authorization track)
  for (const stage of statusPath.stages) {
    stages.push({
      nodeId: stage.nodeId,
      durationYears: {
        min: stage.duration.min,
        max: stage.duration.max,
        display: stage.duration.display || `${stage.duration.min}-${stage.duration.max} yr`,
      },
      track: "status",
      startYear: statusEndYear,
      note: stage.note,
    });
    statusEndYear += stage.duration.max;
  }

  // Calculate when GC process starts
  const gcStartYear = statusPath.permStartOffset ?? 0;

  // Add GC stages (green card track)
  // Track both the sequential position AND the actual end time of all stages
  let gcSequentialYear = gcStartYear;
  let gcMaxEndYear = gcStartYear;

  for (let i = 0; i < gcMethod.stages.length; i++) {
    const stage = gcMethod.stages[i];
    const isConcurrent = stage.concurrent && i > 0;

    // For concurrent stages, start at same time as previous stage
    // For sequential stages, start after the latest end time
    const stageStartYear = isConcurrent
      ? stages[stages.length - 1].startYear
      : gcSequentialYear;

    const stageEndYear = stageStartYear + stage.duration.max;

    stages.push({
      nodeId: stage.nodeId,
      durationYears: {
        min: stage.duration.min,
        max: stage.duration.max,
        display: stage.duration.display || `${stage.duration.min}-${stage.duration.max} yr`,
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

  // Calculate total duration - use the actual max end time
  const maxStatusYear = statusEndYear;
  const totalMax = Math.max(maxStatusYear, gcMaxEndYear);

  const minStatusYear = statusPath.stages.reduce((sum, s) => sum + s.duration.min, 0);
  const minGCYear = (statusPath.permStartOffset ?? 0) +
    gcMethod.stages.filter(s => !s.concurrent).reduce((sum, s) => sum + s.duration.min, 0);
  const totalMin = Math.max(minStatusYear, minGCYear);

  // Build path name
  let pathName: string;
  if (statusPath.id === "none") {
    pathName = `${gcMethod.name} (Direct)`;
  } else if (gcMethod.requiresPerm) {
    pathName = `${statusPath.name} → ${gcCategory}`;
  } else {
    pathName = `${statusPath.name} → ${gcCategory}`;
  }

  // Build description
  let description = statusPath.description;
  if (gcMethod.requiresPerm) {
    const permTiming = statusPath.permStartOffset === 0
      ? "immediately"
      : statusPath.permStartOffset === 0.5
      ? "after 6 months"
      : `at year ${statusPath.permStartOffset}`;
    description += `. Start PERM ${permTiming}.`;
  }

  return {
    id: `${statusPath.id}_${gcMethod.id}`,
    name: pathName,
    emoji: statusPath.emoji,
    description,
    gcCategory,
    totalYears: {
      min: totalMin,
      max: totalMax,
      display: `${totalMin.toFixed(1)}-${totalMax.toFixed(1)} yr`,
    },
    stages,
  };
}

/**
 * Generate all valid paths for the current user filters
 */
export function generatePaths(filters: FilterState): ComposedPath[] {
  const paths: ComposedPath[] = [];

  for (const statusPath of STATUS_PATHS) {
    // Skip if user can't start this status path
    if (!isStatusPathValidForUser(statusPath, filters)) continue;

    for (const gcMethod of GC_METHODS) {
      // Skip if status path and GC method aren't compatible
      if (!isCompatible(statusPath, gcMethod, filters)) continue;

      // Compute GC category
      const gcCategory = computeGCCategory(filters, gcMethod, statusPath);

      // Compose and add the path
      const path = composePath(statusPath, gcMethod, gcCategory, filters);
      paths.push(path);
    }
  }

  // Sort by total duration (fastest first)
  paths.sort((a, b) => a.totalYears.min - b.totalYears.min);

  return paths;
}
