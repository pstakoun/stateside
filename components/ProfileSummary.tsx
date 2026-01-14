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
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-2 sm:py-3">
      <div className="max-w-7xl mx-auto">
        {/* Mobile: Stack vertically, Desktop: Side by side */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap sm:flex-wrap">
              {/* On mobile, show only first 3 tags + count, on desktop show all */}
              {tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-700 rounded-full whitespace-nowrap flex-shrink-0"
                >
                  {tag}
                </span>
              ))}
              {/* Show remaining tags count on mobile, all tags on desktop */}
              {tags.length > 3 && (
                <>
                  <span className="sm:hidden px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full whitespace-nowrap flex-shrink-0">
                    +{tags.length - 3}
                  </span>
                  {tags.slice(3).map((tag, i) => (
                    <span
                      key={i + 3}
                      className="hidden sm:inline-block px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full whitespace-nowrap"
                    >
                      {tag}
                    </span>
                  ))}
                </>
              )}
              
              {/* Progress indicator when tracking a path */}
              {selectedPathId && completedStagesCount > 0 && (
                <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium bg-green-100 text-green-700 rounded-full whitespace-nowrap flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="sm:w-3 sm:h-3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {completedStagesCount} done
                </span>
              )}
            </div>
            <button
              onClick={onEdit}
              className="text-xs sm:text-sm text-brand-600 hover:text-brand-700 font-medium whitespace-nowrap flex-shrink-0"
            >
              Edit
            </button>
          </div>

          <div className="text-xs sm:text-sm text-gray-600 whitespace-nowrap flex-shrink-0">
            <span className="font-semibold text-brand-600">{matchingCount}</span>{" "}
            {matchingCount === 1 ? "path" : "paths"}
          </div>
        </div>
      </div>
    </div>
  );
}
