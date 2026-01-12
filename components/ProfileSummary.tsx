"use client";

import {
  FilterState,
  educationLabels,
  experienceLabels,
  statusLabels,
  countryLabels,
  ebCategoryLabels,
  formatPriorityDateShort,
} from "@/lib/filter-paths";
import { CaseProgress, calculateRemainingSteps, calculateEffectivePriorityDate } from "@/lib/case-progress";

interface ProfileSummaryProps {
  filters: FilterState;
  matchingCount: number;
  onEdit: () => void;
  caseProgress?: CaseProgress | null;
  onEditCase?: () => void;
}

export default function ProfileSummary({
  filters,
  matchingCount,
  onEdit,
  caseProgress,
  onEditCase,
}: ProfileSummaryProps) {
  const tags: string[] = [
    statusLabels[filters.currentStatus],
    educationLabels[filters.education],
    experienceLabels[filters.experience],
  ];

  // Show country of birth for relevant countries (TN-eligible or backlogged)
  if (filters.countryOfBirth !== "other") {
    tags.push(`Born in ${countryLabels[filters.countryOfBirth]}`);
  }

  // Show citizenship if Canadian/Mexican but born elsewhere
  if (filters.isCanadianOrMexicanCitizen) {
    tags.push("CA/MX citizen");
  }

  if (filters.isStem) tags.push("STEM");
  if (filters.hasExtraordinaryAbility) tags.push("Extraordinary ability");
  if (filters.isOutstandingResearcher) tags.push("Outstanding researcher");
  if (filters.isExecutive) tags.push("Executive");
  if (filters.isMarriedToUSCitizen) tags.push("Married to US citizen");
  if (filters.hasInvestmentCapital) tags.push("EB-5 investor");

  // Calculate case progress info
  const hasActiveCaseProgress = caseProgress?.gcProcess?.pathType && caseProgress.gcProcess.pathType !== "none";
  const remainingSteps = hasActiveCaseProgress ? calculateRemainingSteps(caseProgress) : [];
  const completedSteps = remainingSteps.filter(s => s.status === "complete").length;
  const pendingSteps = remainingSteps.filter(s => s.status === "pending").length;
  const effectivePD = hasActiveCaseProgress ? calculateEffectivePriorityDate(caseProgress.gcProcess) : null;

  // Show existing priority date (from case progress or filters)
  const priorityDate = effectivePD?.date || filters.existingPriorityDate;
  const priorityDateCategory = effectivePD?.category || filters.existingPriorityDateCategory;
  
  if (priorityDate) {
    const pdStr = formatPriorityDateShort(priorityDate);
    const category = priorityDateCategory
      ? ebCategoryLabels[priorityDateCategory]
      : "";
    tags.push(`PD: ${pdStr}${category ? ` (${category})` : ""}`);
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full whitespace-nowrap"
              >
                {tag}
              </span>
            ))}
            
            {/* Case Progress Indicator - show if has active case progress */}
            {hasActiveCaseProgress ? (
              <button
                onClick={onEditCase}
                className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap flex items-center gap-1.5 hover:bg-blue-200 transition-colors"
              >
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                {completedSteps}/{remainingSteps.length} steps
                {pendingSteps > 0 && ` • ${pendingSteps} pending`}
              </button>
            ) : onEditCase && (
              /* Subtle prompt to track case if not set up */
              <button
                onClick={onEditCase}
                className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 rounded-full whitespace-nowrap flex items-center gap-1.5 hover:bg-amber-100 transition-colors border border-amber-200"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add my cases
              </button>
            )}
          </div>
          <button
            onClick={onEdit}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap"
          >
            Edit
          </button>
        </div>

        <div className="text-sm text-gray-600 whitespace-nowrap">
          <span className="font-semibold text-brand-600">{matchingCount}</span>{" "}
          {matchingCount === 1 ? "path" : "paths"}
        </div>
      </div>
    </div>
  );
}
