"use client";

import { useState, useCallback, useEffect } from "react";
import TimelineChart from "@/components/TimelineChart";
import PathDetail from "@/components/PathDetail";
import ProfileSummary from "@/components/ProfileSummary";
import OnboardingQuiz from "@/components/OnboardingQuiz";
import { FilterState, defaultFilters } from "@/lib/filter-paths";
import { getStoredProfile, saveUserProfile } from "@/lib/storage";

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [matchingCount, setMatchingCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load stored profile on mount
  useEffect(() => {
    const profile = getStoredProfile();
    if (profile) {
      setFilters(profile.filters);
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }
    setIsLoaded(true);
  }, []);

  const handleMatchingCountChange = useCallback((count: number) => {
    setMatchingCount(count);
  }, []);

  const handleOnboardingComplete = (newFilters: FilterState) => {
    setFilters(newFilters);
    saveUserProfile(newFilters);
    setShowOnboarding(false);
  };

  const handleEditProfile = () => {
    setShowOnboarding(true);
  };

  // Don't render until we've checked localStorage (prevents flash)
  if (!isLoaded) {
    return (
      <main className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-lg bg-brand-500 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col">
      {/* Onboarding Quiz Modal */}
      {showOnboarding && (
        <OnboardingQuiz
          onComplete={handleOnboardingComplete}
          initialFilters={filters}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2.5">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 12h14M12 5l7 7-7 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xl font-semibold text-gray-900 tracking-tight">
            Stateside
          </span>
          <span className="text-sm text-gray-400 hidden sm:inline">
            US immigration paths
          </span>
        </div>
      </header>

      {/* Profile Summary Bar */}
      <ProfileSummary
        filters={filters}
        matchingCount={matchingCount}
        onEdit={handleEditProfile}
      />

      {/* Timeline area */}
      <div className="flex-1 relative overflow-hidden">
        <TimelineChart
          onStageClick={setSelectedNode}
          filters={filters}
          onMatchingCountChange={handleMatchingCountChange}
        />

        {/* Slide-out detail panel */}
        {selectedNode && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => setSelectedNode(null)}
            />
            <PathDetail nodeId={selectedNode} onClose={() => setSelectedNode(null)} />
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto text-xs text-gray-500 text-center">
          Live data from DOL, USCIS, and State Dept. Timelines are estimates. Consult an immigration attorney for your situation.
        </div>
      </footer>
    </main>
  );
}
