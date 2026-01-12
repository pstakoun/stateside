"use client";

import { useState, useCallback, useEffect } from "react";
import TimelineChart from "@/components/TimelineChart";
import PathDetail from "@/components/PathDetail";
import ProfileSummary from "@/components/ProfileSummary";
import OnboardingQuiz from "@/components/OnboardingQuiz";
import TrackerPanel from "@/components/TrackerPanel";
import { FilterState, defaultFilters } from "@/lib/filter-paths";
import { ComposedPath } from "@/lib/path-composer";
import { getStoredProfile, saveUserProfile } from "@/lib/storage";

// Key for storing progress in localStorage
const PROGRESS_STORAGE_KEY = "stateside_progress_v2";

// Stage tracking data with dates and receipt numbers
export interface StageProgress {
  status: "not_started" | "filed" | "approved";
  filedDate?: string; // YYYY-MM-DD date string
  approvedDate?: string; // YYYY-MM-DD date string
  receiptNumber?: string; // e.g., "EAC2490012345"
  priorityDate?: string; // YYYY-MM-DD date string - for I-140 stage
  notes?: string;
}

// Global progress - stage data is shared across all paths
export interface GlobalProgress {
  selectedPathId: string | null; // Currently selected path to track
  stages: Record<string, StageProgress>; // Global stage progress, keyed by nodeId
  portedPriorityDate?: string | null; // YYYY-MM-DD - from a previous case
  portedPriorityDateCategory?: string | null; // eb1, eb2, eb3
  startedAt: string;
  updatedAt: string;
}

// Legacy type for migration
interface LegacyTrackedPathProgress {
  pathId: string;
  pathName: string;
  stages: Record<string, StageProgress>;
  portedPriorityDate?: string | null;
  portedPriorityDateCategory?: string | null;
  startedAt: string;
  updatedAt: string;
}

function loadProgress(): GlobalProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    
    // Migration from legacy format (had pathId/pathName at top level)
    if (parsed.pathId && parsed.pathName && !parsed.selectedPathId) {
      const legacy = parsed as LegacyTrackedPathProgress;
      return {
        selectedPathId: legacy.pathId,
        stages: legacy.stages,
        portedPriorityDate: legacy.portedPriorityDate,
        portedPriorityDateCategory: legacy.portedPriorityDateCategory,
        startedAt: legacy.startedAt,
        updatedAt: legacy.updatedAt,
      };
    }
    
    return parsed as GlobalProgress;
  } catch {
    return null;
  }
}

function saveProgressToStorage(progress: GlobalProgress | null) {
  if (typeof window === "undefined") return;
  try {
    if (progress) {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } else {
      localStorage.removeItem(PROGRESS_STORAGE_KEY);
    }
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
  
  // Global progress state - shared across all paths
  const [globalProgress, setGlobalProgress] = useState<GlobalProgress | null>(null);
  const [selectedPath, setSelectedPath] = useState<ComposedPath | null>(null);
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

  // Load stored profile and progress on mount
  useEffect(() => {
    const profile = getStoredProfile();
    const storedProgress = loadProgress();
    
    let loadedFilters = profile?.filters || defaultFilters;
    
    if (profile) {
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }
    
    if (storedProgress) {
      setGlobalProgress(storedProgress);
      
      // Sync any ported PD to filters for PD wait calculation
      if (storedProgress.portedPriorityDate) {
        const [year, month] = storedProgress.portedPriorityDate.split("-").map(Number);
        const category = storedProgress.portedPriorityDateCategory;
        loadedFilters = {
          ...loadedFilters,
          existingPriorityDate: { year, month },
          existingPriorityDateCategory: category === "eb1" ? "eb1" : 
                                        category === "eb2" ? "eb2" : 
                                        category === "eb3" ? "eb3" : null,
        };
      }
    }
    
    setFilters(loadedFilters);
    setIsLoaded(true);
  }, []);

  // Save progress whenever it changes
  useEffect(() => {
    if (isLoaded) {
      saveProgressToStorage(globalProgress);
    }
  }, [globalProgress, isLoaded]);

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
    setSelectedPath(path);
    
    // Update selected path in global progress (preserve stage data)
    setGlobalProgress(prev => {
      const now = new Date().toISOString();
      if (!prev) {
        // First time tracking - create new progress
        return {
          selectedPathId: path.id,
          stages: {},
          startedAt: now,
          updatedAt: now,
        };
      }
      // Just update selected path, keep all stage data
      return {
        ...prev,
        selectedPathId: path.id,
        updatedAt: now,
      };
    });
  };

  // Handle updating a stage's progress (global - applies to all paths with this stage)
  const handleUpdateStage = (nodeId: string, update: Partial<StageProgress>) => {
    setGlobalProgress(prev => {
      if (!prev) {
        // Create new progress if none exists
        return {
          selectedPathId: null,
          stages: { [nodeId]: { status: "not_started", ...update } },
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      
      const currentStage = prev.stages[nodeId] || { status: "not_started" };
      const newStage = { ...currentStage, ...update };
      
      return {
        ...prev,
        stages: {
          ...prev.stages,
          [nodeId]: newStage,
        },
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // Handle updating ported priority date (from previous employer's I-140)
  const handleUpdatePortedPD = (date: string | null, category: string | null) => {
    setGlobalProgress(prev => {
      const now = new Date().toISOString();
      if (!prev) {
        return {
          selectedPathId: null,
          stages: {},
          portedPriorityDate: date,
          portedPriorityDateCategory: category,
          startedAt: now,
          updatedAt: now,
        };
      }
      return {
        ...prev,
        portedPriorityDate: date,
        portedPriorityDateCategory: category,
        updatedAt: now,
      };
    });
    
    // Sync to filters for PD wait calculation
    syncPortedPDToFilters(date, category);
  };
  
  // Sync priority date to filters for timeline recalculation
  // IMPORTANT: Ported PD only affects the wait calculation, NOT whether PERM is needed
  // hasApprovedI140 should only be true if user has I-140 with CURRENT employer
  const syncPortedPDToFilters = (dateStr: string | null, category: string | null) => {
    if (!dateStr) {
      // Clear existing PD from filters (but don't change hasApprovedI140)
      const newFilters = {
        ...filters,
        existingPriorityDate: null,
        existingPriorityDateCategory: null,
      };
      setFilters(newFilters);
      saveUserProfile(newFilters);
      return;
    }
    
    // Parse YYYY-MM-DD to PriorityDate format
    const [year, month] = dateStr.split("-").map(Number);
    const priorityDate = { year, month };
    
    // Map category string to EBCategory
    const ebCategory = category === "eb1" ? "eb1" : 
                       category === "eb2" ? "eb2" : 
                       category === "eb3" ? "eb3" : null;
    
    // NOTE: We set existingPriorityDate but NOT hasApprovedI140
    // This means: "I have a PD to use for wait calculation, but I still need new PERM"
    const newFilters = {
      ...filters,
      existingPriorityDate: priorityDate,
      existingPriorityDateCategory: ebCategory as "eb1" | "eb2" | "eb3" | null,
      // hasApprovedI140 stays unchanged - only set true if current employer I-140
    };
    setFilters(newFilters);
    saveUserProfile(newFilters);
  };

  // Handle stopping tracking (just deselect path, keep stage data)
  const handleStopTracking = () => {
    setGlobalProgress(prev => prev ? { ...prev, selectedPathId: null } : null);
    setSelectedPath(null);
    setExpandedStageId(null);
  };

  // Handle clicking a stage in the timeline
  const handleTimelineStageClick = (nodeId: string) => {
    if (globalProgress?.selectedPathId && selectedPath) {
      // If tracking, expand this stage in the panel
      setExpandedStageId(nodeId);
    } else {
      // Otherwise, show the info panel
      setSelectedNode(nodeId);
    }
  };

  // Calculate progress summary for selected path
  const getProgressSummary = () => {
    if (!globalProgress || !selectedPath) return null;
    
    let total = 0;
    let filed = 0;
    let approved = 0;
    
    for (const stage of selectedPath.stages) {
      if (stage.isPriorityWait || stage.nodeId === "gc") continue;
      total++;
      const sp = globalProgress.stages[stage.nodeId];
      if (sp?.status === "filed") filed++;
      if (sp?.status === "approved") approved++;
    }
    
    return { total, filed, approved, completed: approved };
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
          {globalProgress?.selectedPathId && selectedPath && (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                <span className="font-medium">{selectedPath.name}</span>
                {progressSummary && (
                  <span className="text-brand-600">
                    • {progressSummary.approved}/{progressSummary.total} complete
                  </span>
                )}
              </div>
              <button
                onClick={handleStopTracking}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Stop tracking"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
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
        selectedPathId={globalProgress?.selectedPathId || null}
        completedStagesCount={progressSummary?.approved || 0}
      />

      {/* Main content area with timeline and tracker panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline area */}
        <div className={`flex-1 relative overflow-hidden transition-all ${globalProgress?.selectedPathId ? "mr-0" : ""}`}>
          <TimelineChart
            onStageClick={handleTimelineStageClick}
            filters={filters}
            onMatchingCountChange={handleMatchingCountChange}
            onSelectPath={handleSelectPath}
            selectedPathId={globalProgress?.selectedPathId || null}
            globalProgress={globalProgress}
          />
        </div>

        {/* Tracker Panel - shows when a path is selected */}
        {globalProgress && selectedPath && (
          <TrackerPanel
            path={selectedPath}
            progress={globalProgress}
            onUpdateStage={handleUpdateStage}
            onUpdatePortedPD={handleUpdatePortedPD}
            onClose={() => setSelectedPath(null)}
            expandedStageId={expandedStageId}
            onExpandStage={setExpandedStageId}
          />
        )}

        {/* Slide-out detail panel for stage info (only when not tracking) */}
        {selectedNode && !globalProgress?.selectedPathId && (
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
