"use client";

import { useState } from "react";
import {
  FilterState,
  Education,
  Experience,
  CurrentStatus,
  CountryOfBirth,
  defaultFilters,
} from "@/lib/filter-paths";
import { trackOnboardingComplete } from "@/lib/analytics";

interface OnboardingQuizProps {
  onComplete: (filters: FilterState) => void;
  initialFilters?: FilterState;
}

const statusOptions: { value: CurrentStatus; label: string; description: string }[] = [
  { value: "canada", label: "Outside the US", description: "Planning to move to the US" },
  { value: "f1", label: "F-1 Student Visa", description: "Currently studying in the US" },
  { value: "opt", label: "OPT", description: "Post-graduation work authorization" },
  { value: "h1b", label: "H-1B", description: "Specialty occupation visa" },
  { value: "tn", label: "TN Visa", description: "USMCA professional visa" },
  { value: "other", label: "Other visa", description: "L-1, O-1, or another status" },
];

const educationOptions: { value: Education; label: string }[] = [
  { value: "highschool", label: "High School" },
  { value: "bachelors", label: "Bachelor's Degree" },
  { value: "masters", label: "Master's Degree" },
  { value: "phd", label: "PhD / Doctorate" },
];

const experienceOptions: { value: Experience; label: string; description: string }[] = [
  { value: "lt2", label: "Less than 2 years", description: "Entry level or recent graduate" },
  { value: "2to5", label: "2-5 years", description: "Mid-level professional" },
  { value: "gt5", label: "5+ years", description: "Senior professional" },
];

const countryOptions: { value: CountryOfBirth; label: string; description: string }[] = [
  { value: "canada", label: "Canada", description: "TN visa eligible" },
  { value: "mexico", label: "Mexico", description: "TN visa eligible" },
  { value: "india", label: "India", description: "Significant EB backlogs" },
  { value: "china", label: "China (mainland)", description: "EB backlogs apply" },
  { value: "other", label: "Other", description: "No major backlogs" },
];

function hasAnySpecialCircumstance(filters: FilterState): boolean {
  return (
    filters.hasExtraordinaryAbility ||
    filters.isOutstandingResearcher ||
    filters.isExecutive ||
    filters.isMarriedToUSCitizen ||
    filters.hasInvestmentCapital
  );
}

export default function OnboardingQuiz({ onComplete, initialFilters }: OnboardingQuizProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters || defaultFilters);
  const [showSpecial, setShowSpecial] = useState(() => hasAnySpecialCircumstance(initialFilters || defaultFilters));

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => {
      const updated = { ...prev, [key]: value };
      // Reset citizenship flag when born in Canada/Mexico (not needed)
      if (key === "countryOfBirth" && (value === "canada" || value === "mexico")) {
        updated.isCanadianOrMexicanCitizen = false;
      }
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trackOnboardingComplete(filters);
    onComplete(filters);
  };

  const specialCount = [
    filters.hasExtraordinaryAbility,
    filters.isOutstandingResearcher,
    filters.isExecutive,
    filters.isMarriedToUSCitizen,
    filters.hasInvestmentCapital,
  ].filter(Boolean).length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-brand-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Welcome to Stateside</h1>
              <p className="text-sm text-gray-500">Tell us about yourself to see your immigration paths</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6">
            {/* Current Status */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Where are you now?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFilter("currentStatus", option.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      filters.currentStatus === option.value
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className={`font-medium text-sm ${
                      filters.currentStatus === option.value ? "text-brand-700" : "text-gray-900"
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Education */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Highest education level
              </label>
              <div className="flex flex-wrap gap-2">
                {educationOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFilter("education", option.value)}
                    className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      filters.education === option.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Years of work experience
              </label>
              <div className="grid grid-cols-3 gap-2">
                {experienceOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFilter("experience", option.value)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                      filters.experience === option.value
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className={`font-medium text-sm ${
                      filters.experience === option.value ? "text-brand-700" : "text-gray-900"
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* STEM */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">
                Is your degree in a STEM field?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => updateFilter("isStem", true)}
                  className={`flex-1 p-3 rounded-xl border-2 text-center transition-all ${
                    filters.isStem
                      ? "border-brand-500 bg-brand-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className={`font-medium text-sm ${filters.isStem ? "text-brand-700" : "text-gray-900"}`}>
                    Yes, STEM
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Science, Tech, Engineering, Math</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateFilter("isStem", false)}
                  className={`flex-1 p-3 rounded-xl border-2 text-center transition-all ${
                    !filters.isStem
                      ? "border-brand-500 bg-brand-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className={`font-medium text-sm ${!filters.isStem ? "text-brand-700" : "text-gray-900"}`}>
                    No
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Other field of study</div>
                </button>
              </div>
            </div>

            {/* Country of Birth */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Country of birth
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Affects TN visa eligibility and green card wait times
              </p>
              <div className="grid grid-cols-5 gap-2">
                {countryOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateFilter("countryOfBirth", option.value)}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                      filters.countryOfBirth === option.value
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className={`font-medium text-sm ${
                      filters.countryOfBirth === option.value ? "text-brand-700" : "text-gray-900"
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                  </button>
                ))}
              </div>

              {/* Citizenship checkbox - only show if NOT born in Canada/Mexico */}
              {filters.countryOfBirth !== "canada" && filters.countryOfBirth !== "mexico" && (
                <label className="flex items-start gap-3 p-3 mt-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={filters.isCanadianOrMexicanCitizen}
                    onChange={(e) => updateFilter("isCanadianOrMexicanCitizen", e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                  />
                  <div>
                    <div className="font-medium text-sm text-gray-900">I&apos;m a Canadian or Mexican citizen</div>
                    <div className="text-xs text-gray-500">Unlocks TN visa paths even if born elsewhere</div>
                  </div>
                </label>
              )}
            </div>

            {/* Special Circumstances - Collapsible */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSpecial(!showSpecial)}
                className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    I have special qualifications
                  </span>
                  {specialCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-brand-100 text-brand-700 rounded-full">
                      {specialCount} selected
                    </span>
                  )}
                </div>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-gray-400 transition-transform ${showSpecial ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showSpecial && (
                <div className="p-4 space-y-2 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-3">Select any that apply to unlock additional paths</p>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filters.hasExtraordinaryAbility}
                      onChange={(e) => updateFilter("hasExtraordinaryAbility", e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                    />
                    <div>
                      <div className="font-medium text-sm text-gray-900">Extraordinary ability</div>
                      <div className="text-xs text-gray-500">Awards, publications, high salary, media coverage, or significant contributions in your field</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filters.isOutstandingResearcher}
                      onChange={(e) => updateFilter("isOutstandingResearcher", e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                    />
                    <div>
                      <div className="font-medium text-sm text-gray-900">Outstanding researcher</div>
                      <div className="text-xs text-gray-500">3+ years research experience with international recognition</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filters.isExecutive}
                      onChange={(e) => updateFilter("isExecutive", e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
                    />
                    <div>
                      <div className="font-medium text-sm text-gray-900">Executive or manager</div>
                      <div className="text-xs text-gray-500">Manager/executive at a multinational company for 1+ year</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filters.isMarriedToUSCitizen}
                      onChange={(e) => updateFilter("isMarriedToUSCitizen", e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
                    />
                    <div>
                      <div className="font-medium text-sm text-gray-900">Married or engaged to US citizen</div>
                      <div className="text-xs text-gray-500">Unlocks family-based green card paths</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={filters.hasInvestmentCapital}
                      onChange={(e) => updateFilter("hasInvestmentCapital", e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-sm text-gray-900">$800k+ to invest</div>
                      <div className="text-xs text-gray-500">Unlocks EB-5 investor visa path</div>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-5 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100 rounded-b-2xl">
            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-brand-500/30 hover:shadow-xl hover:shadow-brand-500/40 active:scale-[0.99]"
            >
              Show my immigration paths →
            </button>
            <p className="text-[11px] text-gray-400 text-center mt-3">
              🔒 Your data stays private • Track progress on any path
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
