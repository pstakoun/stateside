import posthog from "posthog-js";
import { FilterState } from "./filter-paths";

// Check if PostHog is available and initialized
function isPostHogAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof posthog !== "undefined" &&
    typeof posthog.capture === "function" &&
    posthog.__loaded === true
  );
}

// Track when user completes onboarding quiz
export function trackOnboardingComplete(filters: FilterState) {
  if (!isPostHogAvailable()) return;

  posthog.capture("onboarding_complete", {
    education: filters.education,
    experience: filters.experience,
    current_status: filters.currentStatus,
    country_of_birth: filters.countryOfBirth,
    is_stem: filters.isStem,
    has_extraordinary_ability: filters.hasExtraordinaryAbility,
    is_outstanding_researcher: filters.isOutstandingResearcher,
    is_executive: filters.isExecutive,
    is_married_to_usc: filters.isMarriedToUSCitizen,
    has_investment_capital: filters.hasInvestmentCapital,
    has_approved_i140: filters.hasApprovedI140,
    has_existing_priority_date: !!filters.existingPriorityDate,
  });

  // Set user properties for segmentation
  posthog.identify(undefined, {
    education: filters.education,
    experience: filters.experience,
    country_of_birth: filters.countryOfBirth,
    is_stem: filters.isStem,
  });
}

// Track when user views a specific path
export function trackPathView(pathId: string, pathName: string, gcCategory: string) {
  if (!isPostHogAvailable()) return;

  posthog.capture("path_viewed", {
    path_id: pathId,
    path_name: pathName,
    gc_category: gcCategory,
  });
}

// Track when user clicks on a stage/node for details
export function trackStageClick(nodeId: string, nodeName: string) {
  if (!isPostHogAvailable()) return;

  posthog.capture("stage_clicked", {
    node_id: nodeId,
    node_name: nodeName,
  });
}

// Track when user updates their profile/filters
export function trackProfileUpdate(changedField: string, newValue: unknown) {
  if (!isPostHogAvailable()) return;

  posthog.capture("profile_updated", {
    field: changedField,
    value: typeof newValue === "boolean" ? newValue : String(newValue),
  });
}

// Track path count shown to user
export function trackPathsGenerated(count: number, filters: FilterState) {
  if (!isPostHogAvailable()) return;

  posthog.capture("paths_generated", {
    path_count: count,
    education: filters.education,
    experience: filters.experience,
    country_of_birth: filters.countryOfBirth,
  });
}

// Track when user opens the detail panel
export function trackDetailPanelOpen(nodeId: string) {
  if (!isPostHogAvailable()) return;

  posthog.capture("detail_panel_opened", {
    node_id: nodeId,
  });
}

// Track external link clicks (e.g., to USCIS, DOL)
export function trackExternalLinkClick(url: string, context: string) {
  if (!isPostHogAvailable()) return;

  posthog.capture("external_link_clicked", {
    url,
    context,
  });
}
