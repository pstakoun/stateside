import { FilterState, defaultFilters } from "./filter-paths";

const STORAGE_KEY = "stateside_user_profile";

export interface UserProfile {
  filters: FilterState;
  completedOnboarding: boolean;
  createdAt: string;
  updatedAt: string;
}

export function saveUserProfile(filters: FilterState): void {
  const profile: UserProfile = {
    filters,
    completedOnboarding: true,
    createdAt: getStoredProfile()?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save user profile to localStorage:", e);
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

export function clearUserProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear user profile from localStorage:", e);
  }
}
