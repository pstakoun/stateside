import { CountryOfBirth, EBCategory } from "@/lib/filter-paths";

export type CaseRoute = "perm" | "niw" | "eb1";

export type USCISFormType = "I-140" | "I-485" | "I-765" | "I-131" | "I-130" | "I-129";

export interface TrackedReceipt {
  form: USCISFormType;
  receiptNumber: string; // e.g. IOE1234567890
  lastFetchedAt?: string; // ISO
  lastStatusTitle?: string;
  lastStatusDetails?: string;
}

/**
 * A single tracked immigration case (v1).
 * This is intentionally minimal and geared toward the user's request: in-progress cases.
 */
export interface TrackedCase {
  id: string;
  name: string;
  route: CaseRoute;
  countryOfBirth: CountryOfBirth;
  ebCategory: EBCategory; // eb1/eb2/eb3 (for EB-1 routes this should be eb1)

  // Key milestone dates (ISO YYYY-MM-DD). Optional to support partial data.
  pwdFiledDate?: string;
  pwdIssuedDate?: string;
  recruitmentStartDate?: string;
  permFiledDate?: string; // establishes priority date for PERM-based cases
  permApprovedDate?: string;
  i140FiledDate?: string;
  i140ApprovedDate?: string;
  i485FiledDate?: string;
  i485ApprovedDate?: string;

  // Preferences / flags
  i140Premium?: boolean;
  permLikelyAudited?: boolean;
  planningToChangeEmployerSoon?: boolean;

  // Identifiers (optional; for UX only)
  aNumber?: string;
  uscisOnlineAccountNumber?: string;

  receipts: TrackedReceipt[];

  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CaseProfile {
  cases: TrackedCase[];
  selectedCaseId: string | null;
}

export function newTrackedCase(partial?: Partial<TrackedCase>): TrackedCase {
  const now = new Date().toISOString();
  const id = partial?.id ?? `case_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  return {
    id,
    name: partial?.name ?? "My case",
    route: partial?.route ?? "perm",
    countryOfBirth: partial?.countryOfBirth ?? "other",
    ebCategory: partial?.ebCategory ?? "eb2",
    receipts: partial?.receipts ?? [],
    i140Premium: partial?.i140Premium ?? true,
    permLikelyAudited: partial?.permLikelyAudited ?? false,
    planningToChangeEmployerSoon: partial?.planningToChangeEmployerSoon ?? false,
    aNumber: partial?.aNumber,
    uscisOnlineAccountNumber: partial?.uscisOnlineAccountNumber,
    pwdFiledDate: partial?.pwdFiledDate,
    pwdIssuedDate: partial?.pwdIssuedDate,
    recruitmentStartDate: partial?.recruitmentStartDate,
    permFiledDate: partial?.permFiledDate,
    permApprovedDate: partial?.permApprovedDate,
    i140FiledDate: partial?.i140FiledDate,
    i140ApprovedDate: partial?.i140ApprovedDate,
    i485FiledDate: partial?.i485FiledDate,
    i485ApprovedDate: partial?.i485ApprovedDate,
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
  };
}

