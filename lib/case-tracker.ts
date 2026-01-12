import { EBCategory, FilterState, PriorityDate } from "@/lib/filter-paths";

export type CaseType = "employment" | "family";

export type MilestoneStatus =
  | "not_started"
  | "in_progress"
  | "filed"
  | "approved"
  | "denied";

export type EmployerSponsorshipIntent =
  | "staying_with_sponsor"
  | "switching_employer"
  | "not_sure";

export interface CaseMilestoneBase {
  status: MilestoneStatus;
  filedDate?: string; // ISO date string (YYYY-MM-DD recommended)
  approvedDate?: string; // ISO date string
  receiptNumber?: string; // USCIS receipt number (e.g., IOE..., LIN..., etc)
  lastStatusText?: string; // user-entered (since USCIS status API is not reliably accessible)
  lastStatusUpdatedAt?: string; // ISO date-time
}

export interface EmploymentCaseMilestones {
  // PERM (DOL) - no USCIS receipt number
  perm: CaseMilestoneBase & {
    // A PERM is typically tied to the sponsoring employer/job; portability depends on stage.
    sponsorshipIntent?: EmployerSponsorshipIntent;
  };
  i140: CaseMilestoneBase;
  i485: CaseMilestoneBase & {
    ead?: CaseMilestoneBase; // I-765 (optional)
    ap?: CaseMilestoneBase; // I-131 (optional)
  };
}

export interface EmploymentImmigrationCase {
  id: string;
  type: "employment";
  title: string; // user-facing label, e.g. "My EB-2 case"
  category: EBCategory | null; // category you expect to use for bulletin wait
  priorityDate: PriorityDate | null;
  milestones: EmploymentCaseMilestones;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTrackerState {
  enabled: boolean;
  activeCaseId: string | null;
  cases: EmploymentImmigrationCase[]; // MVP: employment only
  updatedAt: string;
}

export const defaultCaseTrackerState: CaseTrackerState = {
  enabled: false,
  activeCaseId: null,
  cases: [],
  updatedAt: new Date(0).toISOString(),
};

export function getActiveEmploymentCase(state: CaseTrackerState | null | undefined): EmploymentImmigrationCase | null {
  if (!state?.enabled) return null;
  if (!state.activeCaseId) return null;
  return state.cases.find((c) => c.id === state.activeCaseId) ?? null;
}

export function derivePriorityDateFromCase(caseData: EmploymentImmigrationCase | null): PriorityDate | null {
  return caseData?.priorityDate ?? null;
}

export function applyActiveCaseToFilters(
  filters: FilterState,
  tracker: CaseTrackerState | null | undefined
): FilterState {
  const active = getActiveEmploymentCase(tracker);
  if (!active) return filters;

  const next: FilterState = { ...filters };

  // Priority date + category drive visa bulletin wait calculations
  next.existingPriorityDate = active.priorityDate ?? null;
  next.existingPriorityDateCategory = active.category ?? null;

  // Only mark "approved I-140" if the tracker says it is approved.
  next.hasApprovedI140 = active.milestones.i140.status === "approved";

  return next;
}

function newId(): string {
  return `case_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/**
 * Migration helper: if legacy filters stored a PD/I-140 approval, convert it into a tracker case.
 * This keeps the UX consistent once onboarding no longer asks for "approved I-140".
 */
export function migrateLegacyPdIntoCaseTracker(
  filters: FilterState,
  existing: CaseTrackerState | null | undefined
): CaseTrackerState {
  const base = existing ?? defaultCaseTrackerState;

  const hasLegacyPd = Boolean(filters.existingPriorityDate);
  const hasLegacyI140Approval = Boolean(filters.hasApprovedI140);

  // If no legacy data, do nothing.
  if (!hasLegacyPd && !hasLegacyI140Approval) return base;

  // If the user already has tracker cases, don't override.
  if (base.cases.length > 0) return base;

  const now = new Date().toISOString();
  const id = newId();

  return {
    enabled: true,
    activeCaseId: id,
    updatedAt: now,
    cases: [
      {
        id,
        type: "employment",
        title: "Imported case",
        category: filters.existingPriorityDateCategory ?? null,
        priorityDate: filters.existingPriorityDate ?? null,
        milestones: {
          perm: { status: "not_started", sponsorshipIntent: "not_sure" },
          i140: { status: filters.hasApprovedI140 ? "approved" : "not_started" },
          i485: { status: "not_started", ead: { status: "not_started" }, ap: { status: "not_started" } },
        },
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

