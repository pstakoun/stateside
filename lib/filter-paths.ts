export type Education = "highschool" | "bachelors" | "masters" | "phd";
export type Experience = "lt2" | "2to5" | "gt5";
export type CurrentStatus = "canada" | "f1" | "opt" | "tn" | "h1b" | "other";

export interface FilterState {
  education: Education;
  experience: Experience;
  currentStatus: CurrentStatus;
  hasExtraordinaryAbility: boolean;
  isExecutive: boolean;
  isStem: boolean;
  isMarriedToUSCitizen: boolean;
  hasInvestmentCapital: boolean;
}

export interface PathEligibility {
  minEducation: Education | null; // null means any
  minExperienceForBachelors?: Experience; // experience needed if only bachelors
  validStartStatuses: CurrentStatus[];
  requiresExtraordinary: boolean;
  requiresExecutive: boolean;
  stemBenefit?: boolean; // shows STEM OPT extension benefit
  requiresMarriage?: boolean; // for marriage-based paths
  requiresInvestment?: boolean; // for EB-5/E-2 paths
}

export const defaultFilters: FilterState = {
  education: "bachelors",
  experience: "lt2",
  currentStatus: "canada",
  hasExtraordinaryAbility: false,
  isExecutive: false,
  isStem: false,
  isMarriedToUSCitizen: false,
  hasInvestmentCapital: false,
};

// Education level ranking for comparison
const educationRank: Record<Education, number> = {
  highschool: 0,
  bachelors: 1,
  masters: 2,
  phd: 3,
};

// Experience level ranking
const experienceRank: Record<Experience, number> = {
  lt2: 0,
  "2to5": 1,
  gt5: 2,
};

// Status to node mapping (for "you are here" highlighting)
export const statusToNodeId: Record<CurrentStatus, string | null> = {
  canada: null, // not in US yet
  f1: "f1",
  opt: "opt",
  tn: "tn",
  h1b: "h1b",
  other: null,
};

export function meetsEducationRequirement(
  userEdu: Education,
  required: Education | null
): boolean {
  if (required === null) return true;
  return educationRank[userEdu] >= educationRank[required];
}

export function meetsExperienceRequirement(
  userExp: Experience,
  required: Experience | undefined
): boolean {
  if (!required) return true;
  return experienceRank[userExp] >= experienceRank[required];
}

export function isPathEligible(
  filters: FilterState,
  eligibility: PathEligibility
): boolean {
  // Check education requirement
  const hasRequiredEducation = meetsEducationRequirement(
    filters.education,
    eligibility.minEducation
  );

  // For EB-2 with bachelors, need 5+ years experience
  let educationOk = hasRequiredEducation;
  if (
    eligibility.minEducation === "masters" &&
    filters.education === "bachelors"
  ) {
    // Bachelors + 5yr experience can substitute for masters
    educationOk = meetsExperienceRequirement(
      filters.experience,
      eligibility.minExperienceForBachelors
    );
  }

  if (!educationOk) return false;

  // Check if user's current status allows starting this path
  if (!eligibility.validStartStatuses.includes(filters.currentStatus)) {
    // Exception: if user is further along in the process, they can still see the path
    // e.g., if on H-1B, can still see TN paths (for reference)
    // For now, we'll be strict
    return false;
  }

  // Check special qualifications
  if (eligibility.requiresExtraordinary && !filters.hasExtraordinaryAbility) {
    return false;
  }

  if (eligibility.requiresExecutive && !filters.isExecutive) {
    return false;
  }

  if (eligibility.requiresMarriage && !filters.isMarriedToUSCitizen) {
    return false;
  }

  if (eligibility.requiresInvestment && !filters.hasInvestmentCapital) {
    return false;
  }

  return true;
}

// Get the starting stage index for a path based on current status
export function getStartingStageIndex(
  stages: { nodeId: string }[],
  currentStatus: CurrentStatus
): number {
  const currentNodeId = statusToNodeId[currentStatus];
  if (!currentNodeId) return 0;

  const index = stages.findIndex((s) => s.nodeId === currentNodeId);
  return index >= 0 ? index : 0;
}

// Labels for display
export const educationLabels: Record<Education, string> = {
  highschool: "High School",
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
};

export const experienceLabels: Record<Experience, string> = {
  lt2: "< 2 years",
  "2to5": "2-5 years",
  gt5: "5+ years",
};

export const statusLabels: Record<CurrentStatus, string> = {
  canada: "In Canada",
  f1: "F-1 Student",
  opt: "On OPT",
  tn: "TN Visa",
  h1b: "H-1B",
  other: "Other",
};
