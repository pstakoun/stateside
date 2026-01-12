"use client";

import { useState, useCallback, useEffect } from "react";
import TimelineChart from "@/components/TimelineChart";
import PathDetail from "@/components/PathDetail";
import ProfileSummary from "@/components/ProfileSummary";
import OnboardingQuiz from "@/components/OnboardingQuiz";
import CaseTracker from "@/components/CaseTracker";
import { FilterState, defaultFilters } from "@/lib/filter-paths";
import { CaseProgress } from "@/lib/case-progress";
import { getStoredProfile, saveUserProfile, getStoredCaseProgress, saveCaseProgress } from "@/lib/storage";

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [matchingCount, setMatchingCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCaseTracker, setShowCaseTracker] = useState(false);
  const [caseProgress, setCaseProgress] = useState<CaseProgress | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load stored profile and case progress on mount
  useEffect(() => {
    const profile = getStoredProfile();
    const storedCaseProgress = getStoredCaseProgress();
    
    if (profile) {
      setFilters(profile.filters);
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }
    
    if (storedCaseProgress) {
      setCaseProgress(storedCaseProgress);
    }
    
    setIsLoaded(true);
  }, []);

  const handleMatchingCountChange = useCallback((count: number) => {
    setMatchingCount(count);
  }, []);

  const handleOnboardingComplete = (newFilters: FilterState, wantsToTrackCase?: boolean) => {
    setFilters(newFilters);
    saveUserProfile(newFilters);
    setShowOnboarding(false);
    
    // If user wants to track their case, open the case tracker
    if (wantsToTrackCase) {
      setShowCaseTracker(true);
    }
  };

  const handleEditProfile = () => {
    setShowOnboarding(true);
  };

  const handleCaseProgressUpdate = (progress: CaseProgress) => {
    setCaseProgress(progress);
    saveCaseProgress(progress);
    
    // Update filters based on case progress
    if (progress.effectivePriorityDate && progress.effectiveEBCategory) {
      const updatedFilters: FilterState = {
        ...filters,
        hasApprovedI140: true,
        existingPriorityDate: progress.effectivePriorityDate,
        existingPriorityDateCategory: progress.effectiveEBCategory,
        // If they have approved I-140 with same employer, no new PERM needed
        needsNewPerm: false,
      };
      setFilters(updatedFilters);
      saveUserProfile(updatedFilters);
    }
  };

  const handleOpenCaseTracker = () => {
    setShowCaseTracker(true);
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

      {/* Case Tracker Modal */}
      {showCaseTracker && (
        <CaseTracker
          onClose={() => setShowCaseTracker(false)}
          onUpdate={handleCaseProgressUpdate}
          initialProgress={caseProgress || undefined}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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

          {/* Track My Case Button */}
          <button
            onClick={handleOpenCaseTracker}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span className="hidden sm:inline">Track My Case</span>
          </button>
        </div>
      </header>

      {/* Profile Summary Bar */}
      <ProfileSummary
        filters={filters}
        matchingCount={matchingCount}
        onEdit={handleEditProfile}
        caseProgress={caseProgress}
        onEditCase={handleOpenCaseTracker}
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

      {/* Footer with SEO content */}
      <footer className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs text-gray-500 text-center mb-3">
            Live data from DOL, USCIS, and State Dept. Timelines are estimates. Consult an immigration attorney for your situation.
          </p>

          {/* SEO-friendly content - visible but subtle */}
          <div className="text-xs text-gray-400 text-center space-y-1">
            <p>
              <strong className="text-gray-500">Stateside</strong> helps you find your fastest path to a US green card.
            </p>
            <p>
              Compare H-1B, TN, L-1, O-1 visa timelines • EB-1, EB-2, EB-3 employment-based green cards • NIW self-petition
            </p>
            <p>
              Live USCIS processing times • Visa bulletin priority dates • India &amp; China backlog estimates
            </p>
          </div>
        </div>
      </footer>

      {/* Screen reader only - detailed description for accessibility and AI crawlers */}
      <div className="sr-only" aria-label="About Stateside">
        <h2>What is Stateside?</h2>
        <p>
          Stateside is a free interactive tool that helps immigrants find their fastest path to a US green card.
          It shows personalized immigration pathways based on your current visa status, education, work experience,
          and country of birth.
        </p>
        <h3>Features</h3>
        <ul>
          <li>Live USCIS processing times updated daily</li>
          <li>Visa bulletin priority dates from the Department of State</li>
          <li>DOL PERM labor certification timelines</li>
          <li>H-1B, TN, L-1, O-1 work visa pathways</li>
          <li>EB-1, EB-2, EB-3 employment-based green card timelines</li>
          <li>EB-2 NIW (National Interest Waiver) eligibility</li>
          <li>Marriage-based green card timelines</li>
          <li>India and China green card backlog estimates</li>
          <li>Concurrent filing eligibility checker</li>
          <li>Priority date portability calculator</li>
        </ul>
        <h3>Who is this for?</h3>
        <p>
          Stateside is designed for professionals on H-1B, TN, L-1, O-1 visas, F-1 students on OPT,
          and anyone exploring US immigration options. It helps you understand your green card timeline
          before consulting with an immigration attorney.
        </p>
      </div>
    </main>
  );
}
