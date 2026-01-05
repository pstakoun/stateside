"use client";

import {
  FilterState,
  Education,
  Experience,
  CurrentStatus,
  educationLabels,
  experienceLabels,
  statusLabels,
} from "@/lib/filter-paths";

interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  matchingCount: number;
}

export default function FilterPanel({
  filters,
  onChange,
  matchingCount,
}: FilterPanelProps) {
  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center gap-4">
          {/* Education Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Education
            </label>
            <select
              value={filters.education}
              onChange={(e) =>
                updateFilter("education", e.target.value as Education)
              }
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(educationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Experience Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Experience
            </label>
            <select
              value={filters.experience}
              onChange={(e) =>
                updateFilter("experience", e.target.value as Experience)
              }
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(experienceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Current Status Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Currently
            </label>
            <select
              value={filters.currentStatus}
              onChange={(e) =>
                updateFilter("currentStatus", e.target.value as CurrentStatus)
              }
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-gray-300 hidden sm:block" />

          {/* STEM Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.isStem}
              onChange={(e) => updateFilter("isStem", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">STEM field</span>
          </label>

          {/* Extraordinary Ability Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasExtraordinaryAbility}
              onChange={(e) =>
                updateFilter("hasExtraordinaryAbility", e.target.checked)
              }
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Extraordinary ability</span>
          </label>

          {/* Executive Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.isExecutive}
              onChange={(e) => updateFilter("isExecutive", e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Executive/Manager</span>
          </label>

          {/* Marriage Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.isMarriedToUSCitizen}
              onChange={(e) => updateFilter("isMarriedToUSCitizen", e.target.checked)}
              className="w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
            />
            <span className="text-sm text-gray-700">Married/engaged to US citizen</span>
          </label>

          {/* Investment Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hasInvestmentCapital}
              onChange={(e) => updateFilter("hasInvestmentCapital", e.target.checked)}
              className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
            />
            <span className="text-sm text-gray-700">$100k+ to invest</span>
          </label>
        </div>

        {/* Results summary */}
        <div className="mt-3 text-sm text-gray-600">
          Showing{" "}
          <span className="font-semibold text-blue-600">{matchingCount}</span>{" "}
          {matchingCount === 1 ? "path" : "paths"} for your situation
        </div>
      </div>
    </div>
  );
}
