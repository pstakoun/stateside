export type Education = "highschool" | "bachelors" | "masters" | "phd";
export type Experience = "lt2" | "2to5" | "gt5";
export type CurrentStatus = "canada" | "f1" | "opt" | "tn" | "h1b" | "other";
export type CountryOfBirth = "canada" | "mexico" | "india" | "china" | "other";
export type EBCategory = "eb1" | "eb2" | "eb3";

export interface PriorityDate {
  day: number;   // 1-31
  month: number; // 1-12
  year: number;  // e.g., 2019
}

// In-progress case step status
export type CaseStepStatus = "not_started" | "pending" | "approved";

// Detailed case progress tracking
export interface InProgressCase {
  // PERM process
  pwdStatus: CaseStepStatus;
  pwdFiledDate?: string; // ISO date
  recruitmentStatus: CaseStepStatus;
  permStatus: CaseStepStatus;
  permFiledDate?: string; // ISO date
  
  // I-140
  i140Status: CaseStepStatus;
  i140FiledDate?: string; // ISO date
  i140ReceiptNumber?: string;
  
  // I-485
  i485Status: CaseStepStatus;
  i485FiledDate?: string; // ISO date
  i485ReceiptNumber?: string;
}

export interface FilterState {
  education: Education;
  experience: Experience;
  currentStatus: CurrentStatus;
  countryOfBirth: CountryOfBirth;
  hasExtraordinaryAbility: boolean;
  isOutstandingResearcher: boolean;
  isExecutive: boolean;
  isStem: boolean;
  isMarriedToUSCitizen: boolean;
  hasInvestmentCapital: boolean;
  isCanadianOrMexicanCitizen: boolean; // for TN eligibility when not born in CA/MX
  // Existing case info
  hasApprovedI140: boolean;
  existingPriorityDate: PriorityDate | null;
  existingPriorityDateCategory: EBCategory | null;
  // Detailed in-progress case tracking
  inProgressCase?: InProgressCase;
  // Employer switch tracking - affects whether PERM is needed
  needsNewPerm?: boolean; // true if switching employers with approved I-140
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
  countryOfBirth: "canada",
  hasExtraordinaryAbility: false,
  isOutstandingResearcher: false,
  isExecutive: false,
  isStem: false,
  isMarriedToUSCitizen: false,
  hasInvestmentCapital: false,
  isCanadianOrMexicanCitizen: false,
  hasApprovedI140: false,
  existingPriorityDate: null,
  existingPriorityDateCategory: null,
  inProgressCase: undefined,
  needsNewPerm: undefined,
};

// Check if user needs to do PERM based on their case status
export function needsPerm(filters: FilterState): boolean {
  // If they have approved I-140 and NOT switching employers, no new PERM needed
  if (filters.hasApprovedI140 && !filters.needsNewPerm) {
    return false;
  }
  // If explicitly set that new PERM is needed
  if (filters.needsNewPerm) {
    return true;
  }
  // Default: needs PERM if no approved I-140
  return !filters.hasApprovedI140;
}

// Calculate how many months remain in a pending step based on when it was filed
export function calculateRemainingMonths(
  filedDate: string | undefined,
  typicalDurationMonths: number
): number {
  if (!filedDate) return typicalDurationMonths;
  
  const filed = new Date(filedDate);
  const now = new Date();
  const monthsElapsed = (now.getFullYear() - filed.getFullYear()) * 12 +
    (now.getMonth() - filed.getMonth());
  
  // At least 1 month remaining to account for uncertainty
  return Math.max(1, typicalDurationMonths - monthsElapsed);
}

// Calculate how much the priority date has "aged" (moved closer to current)
// since a specific date, given the velocity of the bulletin
export function calculatePDAgingSince(
  sinceDate: string,
  velocityMonthsPerYear: number
): number {
  const since = new Date(sinceDate);
  const now = new Date();
  const monthsElapsed = (now.getFullYear() - since.getFullYear()) * 12 +
    (now.getMonth() - since.getMonth());
  
  // The bulletin advances at velocityMonthsPerYear rate
  // So in X months, it advances X * (velocity/12) months
  return Math.round(monthsElapsed * (velocityMonthsPerYear / 12));
}

// Helper to format priority date as "Mon D, YYYY" string
export function formatPriorityDateShort(pd: PriorityDate): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[pd.month - 1]} ${pd.day}, ${pd.year}`;
}

// Helper to convert PriorityDate to "Month YYYY" string for visa bulletin comparison
// Note: Visa bulletins use month/year, so day is not included here
export function priorityDateToString(pd: PriorityDate): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[pd.month - 1]} ${pd.year}`;
}

// Helper to convert PriorityDate to YYYY-MM-DD string format
export function priorityDateToISOString(pd: PriorityDate): string {
  const month = pd.month.toString().padStart(2, "0");
  const day = pd.day.toString().padStart(2, "0");
  return `${pd.year}-${month}-${day}`;
}

// Helper to get the number of days in a given month
function getDaysInMonth(year: number, month: number): number {
  // month is 1-indexed (1=Jan, 12=Dec)
  // new Date(year, month, 0) gives last day of previous month, so month here is 1-indexed
  return new Date(year, month, 0).getDate();
}

// Helper to parse YYYY-MM-DD string to PriorityDate
export function parsePriorityDateFromISO(dateStr: string): PriorityDate | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  // Validate year is reasonable (1900-2100)
  if (year < 1900 || year > 2100) return null;
  // Validate month
  if (month < 1 || month > 12) return null;
  // Validate day against actual days in that month (handles Feb 29 in leap years)
  const daysInMonth = getDaysInMonth(year, month);
  if (day < 1 || day > daysInMonth) return null;
  return { day, month, year };
}

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

export const countryLabels: Record<CountryOfBirth, string> = {
  canada: "Canada",
  mexico: "Mexico",
  india: "India",
  china: "China",
  other: "Other",
};

export const ebCategoryLabels: Record<EBCategory, string> = {
  eb1: "EB-1",
  eb2: "EB-2",
  eb3: "EB-3",
};

// Check if user is eligible for TN visa (Canadian or Mexican citizen)
export function isTNEligible(filters: FilterState): boolean {
  return (
    filters.countryOfBirth === "canada" ||
    filters.countryOfBirth === "mexico" ||
    filters.isCanadianOrMexicanCitizen
  );
}
