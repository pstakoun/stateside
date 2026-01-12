import { FilterState, defaultFilters } from "./filter-paths";
import { CaseProfile, TrackedCase, newTrackedCase } from "@/lib/case-types";

const STORAGE_KEY = "stateside_user_profile";

export interface UserProfile {
  filters: FilterState;
  // Case tracking (optional; added in v2 storage)
  cases?: TrackedCase[];
  selectedCaseId?: string | null;
  completedOnboarding: boolean;
  createdAt: string;
  updatedAt: string;
}

export function saveUserProfile(filters: FilterState): void {
  const existing = getStoredProfile();
  const profile: UserProfile = {
    filters,
    cases: existing?.cases,
    selectedCaseId: existing?.selectedCaseId ?? null,
    completedOnboarding: true,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save user profile to localStorage:", e);
  }
}

export function saveCaseProfile(caseProfile: CaseProfile): void {
  const existing = getStoredProfile();
  const profile: UserProfile = {
    filters: existing?.filters ?? defaultFilters,
    cases: caseProfile.cases,
    selectedCaseId: caseProfile.selectedCaseId,
    completedOnboarding: existing?.completedOnboarding ?? false,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save case profile to localStorage:", e);
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

    // Migration: add case tracking container
    if (!Array.isArray(profile.cases)) {
      profile.cases = [];
    }
    if (profile.selectedCaseId === undefined) {
      profile.selectedCaseId = null;
    }

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

export function getStoredCaseProfile(): CaseProfile {
  const profile = getStoredProfile();
  return {
    cases: profile?.cases ?? [],
    selectedCaseId: profile?.selectedCaseId ?? null,
  };
}

export function upsertTrackedCase(nextCase: TrackedCase): CaseProfile {
  const current = getStoredCaseProfile();
  const now = new Date().toISOString();
  const normalized: TrackedCase = {
    ...newTrackedCase(nextCase),
    id: nextCase.id,
    createdAt: nextCase.createdAt || now,
    updatedAt: now,
  };

  const idx = current.cases.findIndex((c) => c.id === normalized.id);
  const cases =
    idx >= 0
      ? current.cases.map((c, i) => (i === idx ? normalized : c))
      : [normalized, ...current.cases];

  const selectedCaseId = current.selectedCaseId ?? normalized.id;
  const updated: CaseProfile = { cases, selectedCaseId };
  saveCaseProfile(updated);
  return updated;
}

export function deleteTrackedCase(caseId: string): CaseProfile {
  const current = getStoredCaseProfile();
  const cases = current.cases.filter((c) => c.id !== caseId);
  const selectedCaseId =
    current.selectedCaseId === caseId ? (cases[0]?.id ?? null) : current.selectedCaseId;
  const updated: CaseProfile = { cases, selectedCaseId };
  saveCaseProfile(updated);
  return updated;
}

export function setSelectedCaseId(caseId: string | null): CaseProfile {
  const current = getStoredCaseProfile();
  const updated: CaseProfile = { cases: current.cases, selectedCaseId: caseId };
  saveCaseProfile(updated);
  return updated;
}

export function clearUserProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear user profile from localStorage:", e);
  }
}
