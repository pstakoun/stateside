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

export interface TrackedPathProgress {
  pathId: string;
  pathName: string;
  stages: Record<string, StageProgress>; // keyed by nodeId
  portedPriorityDate?: string | null; // YYYY-MM-DD - from a previous case
  portedPriorityDateCategory?: string | null; // eb1, eb2, eb3
  startedAt: string;
  updatedAt: string;
}

function loadProgress(): TrackedPathProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveProgressToStorage(progress: TrackedPathProgress | null) {
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
  
  // Path tracking state
  const [trackedPath, setTrackedPath] = useState<TrackedPathProgress | null>(null);
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
      setTrackedPath(storedProgress);
      
      // Sync any ported PD to filters
      if (storedProgress.portedPriorityDate) {
        const [year, month] = storedProgress.portedPriorityDate.split("-").map(Number);
        const category = storedProgress.portedPriorityDateCategory;
        loadedFilters = {
          ...loadedFilters,
          hasApprovedI140: true,
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
      saveProgressToStorage(trackedPath);
    }
  }, [trackedPath, isLoaded]);

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
    
    if (trackedPath?.pathId === path.id) {
      // Already tracking this path - just open panel
      return;
    }
    
    // Start tracking a new path
    const now = new Date().toISOString();
    const newProgress: TrackedPathProgress = {
      pathId: path.id,
      pathName: path.name,
      stages: {},
      startedAt: now,
      updatedAt: now,
    };
    
    // Initialize all stages as not_started
    path.stages.forEach(stage => {
      newProgress.stages[stage.nodeId] = {
        status: "not_started",
      };
    });
    
    setTrackedPath(newProgress);
  };

  // Stages that establish priority dates
  const PRIORITY_DATE_STAGES = ["i140", "perm", "eb2niw", "eb1a", "eb1b", "eb1c"];
  
  // Handle updating a stage's progress
  const handleUpdateStage = (nodeId: string, update: Partial<StageProgress>) => {
    if (!trackedPath) return;
    
    setTrackedPath(prev => {
      if (!prev) return prev;
      
      const currentStage = prev.stages[nodeId] || { status: "not_started" };
      const newStage = { ...currentStage, ...update };
      
      // Check if this is a PD-establishing stage being approved with a priority date
      if (PRIORITY_DATE_STAGES.includes(nodeId) && 
          newStage.status === "approved" && 
          newStage.priorityDate) {
        // Determine category based on path or stage
        let category: string | null = null;
        if (nodeId === "eb1a" || nodeId === "eb1b" || nodeId === "eb1c") {
          category = "eb1";
        } else if (nodeId === "eb2niw") {
          category = "eb2";
        } else {
          // For I-140/PERM, infer from path name or use tracked category
          if (prev.pathName?.toLowerCase().includes("eb-2") || prev.pathName?.toLowerCase().includes("eb2")) {
            category = "eb2";
          } else if (prev.pathName?.toLowerCase().includes("eb-3") || prev.pathName?.toLowerCase().includes("eb3")) {
            category = "eb3";
          } else if (prev.pathName?.toLowerCase().includes("eb-1") || prev.pathName?.toLowerCase().includes("eb1")) {
            category = "eb1";
          }
        }
        
        // Only sync if we don't have a ported PD (ported takes precedence)
        if (!prev.portedPriorityDate) {
          syncPriorityDateToFilters(newStage.priorityDate, category);
        }
      }
      
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

  // Handle updating ported priority date
  const handleUpdatePortedPD = (date: string | null, category: string | null) => {
    if (!trackedPath) return;
    
    setTrackedPath(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        portedPriorityDate: date,
        portedPriorityDateCategory: category,
        updatedAt: new Date().toISOString(),
      };
    });
    
    // Sync to filters to update timeline calculation
    syncPriorityDateToFilters(date, category);
  };
  
  // Sync priority date to filters for timeline recalculation
  const syncPriorityDateToFilters = (dateStr: string | null, category: string | null) => {
    if (!dateStr) {
      // Clear existing PD from filters
      const newFilters = {
        ...filters,
        hasApprovedI140: false,
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
    
    const newFilters = {
      ...filters,
      hasApprovedI140: true,
      existingPriorityDate: priorityDate,
      existingPriorityDateCategory: ebCategory as "eb1" | "eb2" | "eb3" | null,
    };
    setFilters(newFilters);
    saveUserProfile(newFilters);
  };

  // Handle stopping tracking
  const handleStopTracking = () => {
    setTrackedPath(null);
    setSelectedPath(null);
    setExpandedStageId(null);
  };

  // Handle clicking a stage in the timeline (when tracking, open in panel)
  const handleTimelineStageClick = (nodeId: string) => {
    if (trackedPath && selectedPath) {
      // If tracking, expand this stage in the panel
      setExpandedStageId(nodeId);
    } else {
      // Otherwise, show the info panel
      setSelectedNode(nodeId);
    }
  };

  // Calculate progress summary
  const getProgressSummary = () => {
    if (!trackedPath) return null;
    
    const stages = Object.values(trackedPath.stages);
    const total = stages.length;
    const filed = stages.filter(s => s.status === "filed").length;
    const approved = stages.filter(s => s.status === "approved").length;
    
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
          {trackedPath && (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                <span className="font-medium">{trackedPath.pathName}</span>
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
        selectedPathId={trackedPath?.pathId || null}
        completedStagesCount={progressSummary?.approved || 0}
      />

      {/* Main content area with timeline and tracker panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Timeline area */}
        <div className={`flex-1 relative overflow-hidden transition-all ${trackedPath ? "mr-0" : ""}`}>
          <TimelineChart
            onStageClick={handleTimelineStageClick}
            filters={filters}
            onMatchingCountChange={handleMatchingCountChange}
            onSelectPath={handleSelectPath}
            selectedPathId={trackedPath?.pathId || null}
            trackedProgress={trackedPath}
          />
        </div>

        {/* Tracker Panel - shows when tracking a path */}
        {trackedPath && selectedPath && (
          <TrackerPanel
            path={selectedPath}
            progress={trackedPath}
            onUpdateStage={handleUpdateStage}
            onUpdatePortedPD={handleUpdatePortedPD}
            onClose={() => setSelectedPath(null)}
            expandedStageId={expandedStageId}
            onExpandStage={setExpandedStageId}
          />
        )}

        {/* Slide-out detail panel for stage info (only when not tracking) */}
        {selectedNode && !trackedPath && (
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
