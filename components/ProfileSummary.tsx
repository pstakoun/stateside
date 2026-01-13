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

interface ProfileSummaryProps {
  filters: FilterState;
  matchingCount: number;
  onEdit: () => void;
  selectedPathId?: string | null;
  completedStagesCount?: number;
}

export default function ProfileSummary({
  filters,
  matchingCount,
  onEdit,
  selectedPathId,
  completedStagesCount = 0,
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

  // Show existing priority date from filters
  const priorityDate = filters.existingPriorityDate;
  const priorityDateCategory = filters.existingPriorityDateCategory;
  
  if (priorityDate) {
    const pdStr = formatPriorityDateShort(priorityDate);
    const category = priorityDateCategory
      ? ebCategoryLabels[priorityDateCategory]
      : "";
    tags.push(`PD: ${pdStr}${category ? ` (${category})` : ""}`);
  }

  return (
    <div className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {tags.map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white text-gray-600 rounded-full whitespace-nowrap border border-gray-100 shadow-sm"
              >
                {tag}
              </span>
            ))}
            
            {/* Progress indicator when tracking a path */}
            {selectedPathId && completedStagesCount > 0 && (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-green-50 text-green-700 rounded-full whitespace-nowrap flex items-center gap-1.5 border border-green-100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {completedStagesCount} done
              </span>
            )}
          </div>
          <button
            onClick={onEdit}
            className="text-xs text-brand-600 hover:text-brand-700 font-semibold whitespace-nowrap hover:bg-brand-50 px-2.5 py-1 rounded-full transition-all duration-200"
          >
            Edit ✎
          </button>
        </div>

        <div className="text-xs text-gray-500 whitespace-nowrap bg-white px-3 py-1.5 rounded-full border border-gray-100 shadow-sm">
          <span className="font-bold text-brand-600">{matchingCount}</span>{" "}
          <span className="font-medium">{matchingCount === 1 ? "path" : "paths"}</span>
        </div>
      </div>
    </div>
  );
}
