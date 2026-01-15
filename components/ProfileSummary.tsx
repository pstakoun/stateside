"use client";

import { useState } from "react";
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
  const [isExpanded, setIsExpanded] = useState(false);
  
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

  // Split tags for mobile: show first 3, rest in expandable
  const visibleTags = tags.slice(0, 3);
  const hiddenTags = tags.slice(3);
  const hasHiddenTags = hiddenTags.length > 0;

  return (
    <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-2.5 md:py-3">
      <div className="max-w-7xl mx-auto">
        {/* Mobile: Compact view with expand option */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              {visibleTags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700 rounded-full whitespace-nowrap flex-shrink-0"
                >
                  {tag}
                </span>
              ))}
              {hasHiddenTags && !isExpanded && (
                <button
                  onClick={() => setIsExpanded(true)}
                  className="text-[11px] text-brand-600 font-medium whitespace-nowrap"
                >
                  +{hiddenTags.length} more
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-gray-600">
                <span className="font-semibold text-brand-600">{matchingCount}</span> paths
              </span>
              <button
                onClick={onEdit}
                className="text-xs text-brand-600 font-medium px-2 py-1 bg-brand-50 rounded-lg active:bg-brand-100"
              >
                Edit
              </button>
            </div>
          </div>
          
          {/* Expanded tags */}
          {isExpanded && hasHiddenTags && (
            <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-gray-100">
              {hiddenTags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700 rounded-full whitespace-nowrap"
                >
                  {tag}
                </span>
              ))}
              {selectedPathId && completedStagesCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700 rounded-full whitespace-nowrap flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {completedStagesCount} done
                </span>
              )}
              <button
                onClick={() => setIsExpanded(false)}
                className="text-[11px] text-gray-500"
              >
                Show less
              </button>
            </div>
          )}
        </div>
        
        {/* Desktop: Full view */}
        <div className="hidden md:flex items-center justify-between gap-4">
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
              
              {/* Progress indicator when tracking a path */}
              {selectedPathId && completedStagesCount > 0 && (
                <span className="px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full whitespace-nowrap flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {completedStagesCount} completed
                </span>
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
    </div>
  );
}
