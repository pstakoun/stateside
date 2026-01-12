import { FilterState, defaultFilters } from "./filter-paths";
import { CaseTrackerState, defaultCaseTrackerState, migrateLegacyPdIntoCaseTracker } from "./case-tracker";

const STORAGE_KEY = "stateside_user_profile";

export interface UserProfile {
  filters: FilterState;
  completedOnboarding: boolean;
  caseTracker?: CaseTrackerState;
  createdAt: string;
  updatedAt: string;
}

export function saveUserProfile(filters: FilterState): void {
  const profile: UserProfile = {
    filters,
    completedOnboarding: true,
    caseTracker: getStoredProfile()?.caseTracker ?? defaultCaseTrackerState,
    createdAt: getStoredProfile()?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save user profile to localStorage:", e);
  }
}

export function saveCaseTrackerState(caseTracker: CaseTrackerState): void {
  const existing = getStoredProfile();
  const profile: UserProfile = {
    filters: existing?.filters ?? defaultFilters,
    completedOnboarding: existing?.completedOnboarding ?? false,
    caseTracker: {
      ...caseTracker,
      updatedAt: new Date().toISOString(),
    },
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save case tracker state to localStorage:", e);
  }
}

export function getStoredProfile(): UserProfile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const profile = JSON.parse(stored) as UserProfile;

    // Validate the profile has expected structure
    if (!profile.filters || typeof profile.completedOnboarding !== "boolean") {
      return null;
    }

    // Migration: add countryOfBirth for existing users
    if (!profile.filters.countryOfBirth) {
      profile.filters.countryOfBirth = "other";
    }

    // Migration: add isCanadianOrMexicanCitizen for existing users
    if (profile.filters.isCanadianOrMexicanCitizen === undefined) {
      profile.filters.isCanadianOrMexicanCitizen = false;
    }

    // Migration: add priority date fields for existing users
    if (profile.filters.hasApprovedI140 === undefined) {
      profile.filters.hasApprovedI140 = false;
    }
    if (profile.filters.existingPriorityDate === undefined) {
      profile.filters.existingPriorityDate = null;
    }
    if (profile.filters.existingPriorityDateCategory === undefined) {
      profile.filters.existingPriorityDateCategory = null;
    }

    // Migration: add case tracker container (disabled by default)
    if (!profile.caseTracker) {
      profile.caseTracker = defaultCaseTrackerState;
    }

    // Migration: ensure tracker keys exist
    if (profile.caseTracker.enabled === undefined) {
      profile.caseTracker.enabled = false;
    }
    if (profile.caseTracker.activeCaseId === undefined) {
      profile.caseTracker.activeCaseId = null;
    }
    if (!Array.isArray(profile.caseTracker.cases)) {
      profile.caseTracker.cases = [];
    }
    if (!profile.caseTracker.updatedAt) {
      profile.caseTracker.updatedAt = new Date().toISOString();
    }

    // Migration: if legacy PD/I-140 fields exist, import into tracker (and enable it)
    profile.caseTracker = migrateLegacyPdIntoCaseTracker(profile.filters, profile.caseTracker);

    return profile;
  } catch (e) {
    console.warn("Failed to read user profile from localStorage:", e);
    return null;
  }
}

export function hasCompletedOnboarding(): boolean {
  const profile = getStoredProfile();
  return profile?.completedOnboarding ?? false;
}

export function getStoredFilters(): FilterState {
  const profile = getStoredProfile();
  return profile?.filters ?? defaultFilters;
}

export function getStoredCaseTrackerState(): CaseTrackerState {
  const profile = getStoredProfile();
  return profile?.caseTracker ?? defaultCaseTrackerState;
}

export function clearUserProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear user profile from localStorage:", e);
  }
}
