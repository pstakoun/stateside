"use client";

import { useState, useCallback, useEffect } from "react";
import TimelineChart from "@/components/TimelineChart";
import PathDetail from "@/components/PathDetail";
import ProfileSummary from "@/components/ProfileSummary";
import OnboardingQuiz from "@/components/OnboardingQuiz";
import { FilterState, defaultFilters } from "@/lib/filter-paths";
import { ComposedPath } from "@/lib/path-composer";
import { getStoredProfile, saveUserProfile } from "@/lib/storage";

// Key for storing progress in localStorage
const PROGRESS_STORAGE_KEY = "stateside_progress";

interface StoredProgress {
  selectedPathId: string | null;
  completedStages: string[]; // Array of "pathId:nodeId" strings
}

function loadProgress(): StoredProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveProgress(progress: StoredProgress) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors
  }
}

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [matchingCount, setMatchingCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Path tracking state - simplified
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());

  // Load stored profile and progress on mount
  useEffect(() => {
    const profile = getStoredProfile();
    const storedProgress = loadProgress();
    
    if (profile) {
      setFilters(profile.filters);
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }
    
    if (storedProgress) {
      setSelectedPathId(storedProgress.selectedPathId);
      setCompletedStages(new Set(storedProgress.completedStages));
    }
    
    setIsLoaded(true);
  }, []);

  // Save progress whenever it changes
  useEffect(() => {
    if (isLoaded) {
      saveProgress({
        selectedPathId,
        completedStages: Array.from(completedStages),
      });
    }
  }, [selectedPathId, completedStages, isLoaded]);

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

  // Handle selecting a path to track
  const handleSelectPath = (path: ComposedPath) => {
    if (selectedPathId === path.id) {
      // Clicking selected path again deselects it
      setSelectedPathId(null);
    } else {
      setSelectedPathId(path.id);
    }
  };

  // Handle toggling a stage as complete
  const handleToggleStageComplete = (pathId: string, stageNodeId: string) => {
    const key = `${pathId}:${stageNodeId}`;
    setCompletedStages(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Calculate progress for selected path
  const getProgressSummary = () => {
    if (!selectedPathId) return null;
    
    // Count completed stages for this path
    let total = 0;
    let completed = 0;
    completedStages.forEach(key => {
      if (key.startsWith(`${selectedPathId}:`)) {
        completed++;
      }
    });
    
    return { completed, total };
  };

  const progressSummary = getProgressSummary();

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

          {/* Progress indicator - only show when tracking */}
          {selectedPathId && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
              <span>Tracking progress</span>
              <button
                onClick={() => setSelectedPathId(null)}
                className="text-gray-400 hover:text-gray-600 ml-1"
                title="Stop tracking"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Profile Summary Bar */}
      <ProfileSummary
        filters={filters}
        matchingCount={matchingCount}
        onEdit={handleEditProfile}
        selectedPathId={selectedPathId}
        completedStagesCount={progressSummary?.completed || 0}
      />

      {/* Timeline area */}
      <div className="flex-1 relative overflow-hidden">
        <TimelineChart
          onStageClick={setSelectedNode}
          filters={filters}
          onMatchingCountChange={handleMatchingCountChange}
          onSelectPath={handleSelectPath}
          selectedPathId={selectedPathId}
          completedStages={completedStages}
          onToggleStageComplete={handleToggleStageComplete}
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
