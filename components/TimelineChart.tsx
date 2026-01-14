"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import visaData from "@/data/visa-paths.json";
import { FilterState, statusToNodeId } from "@/lib/filter-paths";
import { generatePaths, ComposedStage, ComposedPath, setProcessingTimes } from "@/lib/path-composer";
import { adaptDynamicData } from "@/lib/processing-times";
import { DynamicData, DEFAULT_PRIORITY_DATES, DEFAULT_DATES_FOR_FILING } from "@/lib/dynamic-data";
import { trackStageClick, trackPathsGenerated } from "@/lib/analytics";
import { GlobalProgress, StageProgress } from "@/app/page";
import { 
  STATUS_VISA_NODES, 
  STATUS_VISA_VALIDITY_MONTHS, 
  STATUS_VISA_PROCESSING_MONTHS,
  isStatusVisa,
} from "@/lib/constants";

const PIXELS_PER_YEAR = 160;
const MAX_YEARS = 8;
const TRACK_HEIGHT = 32;
const TRACK_GAP = 6;
const CONCURRENT_OFFSET = 36;

interface TimelineChartProps {
  onStageClick: (nodeId: string) => void;
  filters: FilterState;
  onMatchingCountChange: (count: number) => void;
  onSelectPath?: (path: ComposedPath) => void;
  onPathsGenerated?: (paths: ComposedPath[]) => void;
  selectedPathId?: string | null;
  globalProgress?: GlobalProgress | null;
}

const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  entry: { bg: "bg-brand-600", border: "border-brand-700", text: "text-white" },
  work: { bg: "bg-emerald-500", border: "border-emerald-600", text: "text-white" },
  greencard: { bg: "bg-amber-500", border: "border-amber-600", text: "text-white" },
  citizenship: { bg: "bg-purple-500", border: "border-purple-600", text: "text-white" },
};

const categoryAccents: Record<string, string> = {
  origin: "border-l-gray-400",
  entry: "border-l-brand-600",
  work: "border-l-emerald-500",
  greencard: "border-l-amber-500",
  citizenship: "border-l-purple-500",
};

const trackLabels: Record<string, string> = {
  status: "Status",
  gc: "GC Process",
};

// Format YYYY-MM-DD date string for display
function formatDateForDisplay(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// Format date short (for inline display)
function formatDateShort(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatRelativeYears(years: number): string {
  const absYears = Math.abs(years);
  if (absYears < 0.08) return "now";
  if (absYears < 1) {
    const months = Math.max(1, Math.round(absYears * 12));
    return `${months} mo`;
  }
  return absYears < 2 ? `${absYears.toFixed(1)} yr` : `${Math.round(absYears)} yr`;
}

function formatStageTiming(startYear: number): string {
  const relative = formatRelativeYears(startYear);
  if (relative === "now") return "Starts now";
  return startYear >= 0 ? `Starts in ${relative}` : `Started ${relative} ago`;
}

function getPriorityWaitLabel(stage: ComposedStage): string {
  if (stage.note?.includes("Filing") || stage.note?.includes("Dates for Filing")) {
    return "Filing wait";
  }
  if (stage.note?.includes("Final Action") || stage.note?.includes("approval")) {
    return "Approval wait";
  }
  return "Priority date wait";
}

// Calculate months between two dates
function monthsBetween(date1: Date, date2: Date): number {
  const months = (date2.getFullYear() - date1.getFullYear()) * 12 +
    (date2.getMonth() - date1.getMonth());
  return Math.max(0, months);
}

// Parse YYYY-MM-DD to Date
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (isNaN(year) || isNaN(month)) return null;
  return new Date(year, month - 1, day || 1);
}

// Calculate progress percentage for a filed stage
function getFiledProgress(filedDate: string | undefined, durationMonths: number): number {
  if (!filedDate) return 0;
  const filed = parseDate(filedDate);
  if (!filed) return 0;
  const now = new Date();
  const elapsed = monthsBetween(filed, now);
  return Math.min(100, Math.max(0, (elapsed / durationMonths) * 100));
}

// Use centralized constants from lib/constants.ts for status visa handling
// Stage durations come from path.stages.durationYears (from path-composer)

// Convert a date to "years from today" (negative = past, positive = future)
function dateToYearsFromNow(date: Date): number {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}

// Calculate the timeline offset needed to shift everything so earliest stage starts at 0
// Returns the "now" position in years from timeline start
function calculateTimelineOffset(stages: ComposedStage[]): number {
  let minStart = 0;
  for (const stage of stages) {
    if (stage.startYear < minStart) {
      minStart = stage.startYear;
    }
  }
  // The offset is negative minStart (how much to shift right)
  // "Now" position is at this offset from the start
  return -minStart;
}

// Apply offset to stage positions (shift timeline so it starts at 0)
function shiftStagePositions(stages: ComposedStage[], offset: number): ComposedStage[] {
  return stages.map(stage => ({
    ...stage,
    startYear: stage.startYear + offset,
  }));
}

// Adjust stage positions based on actual progress data
// This recalculates startYear and duration for each stage based on:
// - Approved stages: actual duration from filed→approved dates
// - Filed stages: start at filed date, estimate remaining time
// - Not started: chain from previous stage's actual/estimated end
function adjustStagesForProgress(
  stages: ComposedStage[],
  progress: GlobalProgress | null | undefined
): ComposedStage[] {
  if (!progress || Object.keys(progress.stages).length === 0) {
    // No progress data - return original stages
    return stages;
  }

  const now = new Date();
  const adjustedStages: ComposedStage[] = [];
  
  // Track the end time of each track separately
  // This is important because status track and gc track run in parallel
  const trackEndYears: Record<string, number> = {
    status: 0,
    gc: 0,
  };
  
  // Track whether any stage on each track has progress
  // This determines whether NOT_STARTED stages should:
  // - Chain from progress (if track has progress)
  // - Preserve original composed positions (if track has no progress)
  const trackHasProgress: Record<string, boolean> = {
    status: false,
    gc: false,
  };

  // First pass: calculate actual positions for stages with progress
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const sp = progress.stages[stage.nodeId];
    const track = stage.track || "gc";
    
    // Skip PD wait stages and GC marker for now - handle them after
    if (stage.isPriorityWait || stage.nodeId === "gc") {
      adjustedStages.push(stage);
      continue;
    }

    let adjustedStart = stage.startYear;
    let adjustedDuration = stage.durationYears;

    const isStatusVisa = STATUS_VISA_NODES.has(stage.nodeId);
    
    if (isStatusVisa && sp?.status === "approved" && sp.approvedDate) {
      // STATUS VISA APPROVED: Visa validity STARTS at approved date
      // The bar shows the validity period, not the processing time
      trackHasProgress[track] = true;
      const approvedDate = parseDate(sp.approvedDate);
      
      if (approvedDate) {
        // Visa starts when approved
        adjustedStart = dateToYearsFromNow(approvedDate);
        
        // Use full validity duration (e.g., 3 years for TN)
        const validityMonths = STATUS_VISA_VALIDITY_MONTHS[stage.nodeId] || 36;
        const validityYears = validityMonths / 12;
        
        adjustedDuration = {
          min: validityYears,
          max: validityYears,
          display: `${validityYears.toFixed(0)} yr`,
        };
        
        // Update track end time to when visa expires
        const endYear = adjustedStart + validityYears;
        if (!stage.isConcurrent) {
          trackEndYears[track] = Math.max(trackEndYears[track], endYear);
        }
      }
    } else if (isStatusVisa && sp?.status === "filed" && sp.filedDate) {
      // STATUS VISA FILED: Show processing time + upcoming validity
      trackHasProgress[track] = true;
      const filedDate = parseDate(sp.filedDate);
      
      if (filedDate) {
        adjustedStart = dateToYearsFromNow(filedDate);
        
        // Processing time for status visas is usually short
        const processingMonths = STATUS_VISA_PROCESSING_MONTHS[stage.nodeId] || 1;
        const elapsedMonths = monthsBetween(filedDate, now);
        const remainingProcessing = Math.max(0.5, processingMonths - elapsedMonths);
        
        // After processing, the visa validity begins
        const validityMonths = STATUS_VISA_VALIDITY_MONTHS[stage.nodeId] || 36;
        const totalMonths = elapsedMonths + remainingProcessing + validityMonths;
        const totalYears = totalMonths / 12;
        
        adjustedDuration = {
          min: totalYears * 0.9,
          max: totalYears,
          display: `~${(validityMonths / 12).toFixed(0)} yr`,
        };
        
        const estimatedEndYear = adjustedStart + totalYears;
        if (!stage.isConcurrent) {
          trackEndYears[track] = Math.max(trackEndYears[track], estimatedEndYear);
        }
      }
    } else if (sp?.status === "approved" && sp.filedDate && sp.approvedDate) {
      // PROCESSING STEP APPROVED with dates: use actual duration (filed → approved)
      trackHasProgress[track] = true;
      const filedDate = parseDate(sp.filedDate);
      const approvedDate = parseDate(sp.approvedDate);
      
      if (filedDate && approvedDate) {
        const actualMonths = monthsBetween(filedDate, approvedDate);
        const actualYears = Math.max(0.1, actualMonths / 12);
        
        adjustedStart = dateToYearsFromNow(filedDate);
        
        adjustedDuration = {
          min: actualYears,
          max: actualYears,
          display: actualMonths < 12 
            ? `${Math.round(actualMonths)} mo` 
            : `${actualYears.toFixed(1)} yr`,
        };
        
        const endYear = dateToYearsFromNow(approvedDate);
        if (!stage.isConcurrent) {
          trackEndYears[track] = Math.max(trackEndYears[track], endYear);
        }
      }
    } else if (sp?.status === "approved" && sp.approvedDate) {
      // PROCESSING STEP APPROVED but no filed date - estimate backwards
      trackHasProgress[track] = true;
      const approvedDate = parseDate(sp.approvedDate);
      if (approvedDate) {
        const endYear = dateToYearsFromNow(approvedDate);
        // Use path's duration for consistency
        const stageMaxMonths = stage.durationYears.max * 12;
        adjustedStart = endYear - (stageMaxMonths / 12);
        
        if (!stage.isConcurrent) {
          trackEndYears[track] = Math.max(trackEndYears[track], endYear);
        }
      }
    } else if (sp?.status === "filed" && sp.filedDate) {
      // PROCESSING STEP FILED: show elapsed + estimated remaining
      // Use the PATH's duration for consistency with timeline display
      trackHasProgress[track] = true;
      const filedDate = parseDate(sp.filedDate);
      
      if (filedDate) {
        adjustedStart = dateToYearsFromNow(filedDate);
        
        // Use stage.durationYears.max (same as not-started stages) for consistency
        const stageMaxMonths = stage.durationYears.max * 12;
        const elapsedMonths = monthsBetween(filedDate, now);
        const remainingMonths = Math.max(1, stageMaxMonths - elapsedMonths);
        const totalMonths = elapsedMonths + remainingMonths;
        const totalYears = totalMonths / 12;
        
        adjustedDuration = {
          min: totalYears * 0.8,
          max: totalYears,
          display: totalMonths < 12 
            ? `${Math.round(totalMonths)} mo`
            : `${totalYears.toFixed(1)} yr`,
        };
        
        const estimatedEndYear = adjustedStart + totalYears;
        if (!stage.isConcurrent) {
          trackEndYears[track] = Math.max(trackEndYears[track], estimatedEndYear);
        }
      }
    } else {
      // NOT STARTED: position based on when previous stage ends
      // CRITICAL: Not-started stages can NEVER start before today (time 0)
      // They haven't been filed yet, so they can't be in the past
      if (stage.isConcurrent) {
        // Concurrent stages start at the SAME time as the previous stage
        // But NOT before today since this stage hasn't been filed yet
        const prevStagesOnTrack = adjustedStages.filter(s => s.track === track);
        if (prevStagesOnTrack.length > 0) {
          const prevStage = prevStagesOnTrack[prevStagesOnTrack.length - 1];
          // Use max(prevStage.startYear, 0) - can't start before today
          adjustedStart = Math.max(0, prevStage.startYear);
        }
      } else {
        // Sequential stage: starts after current track end, but not before today
        // 
        // KEY INSIGHT: The behavior depends on whether there's progress on this track:
        // - If there IS progress on this track: chain from trackEndYears (timeline shifted)
        // - If there's NO progress on this track: preserve original startYear (e.g., Student → NIW)
        //
        // This is important for paths like Student → NIW shown alongside TN → EB-3:
        // - TN → EB-3 has PWD filed (gc track has progress) → Recruit chains from PWD end
        // - Student → NIW has no progress on gc track → NIW stays at year 2 (after degree)
        if (trackHasProgress[track]) {
          // Track has progress - chain from where previous stages end
          adjustedStart = Math.max(0, trackEndYears[track]);
        } else {
          // Track has NO progress - preserve original composed position
          // This ensures Student → NIW shows NIW at year 2, not year 0
          adjustedStart = Math.max(0, stage.startYear);
        }
      }
      
      // Update track end time for ALL stages (including concurrent)
      // GC marker needs to know when the last stage ends
      const endYear = adjustedStart + stage.durationYears.max;
      trackEndYears[track] = Math.max(trackEndYears[track], endYear);
    }

    adjustedStages.push({
      ...stage,
      startYear: adjustedStart,
      durationYears: adjustedDuration,
    });
  }

  // Second pass: adjust PD wait, I-485, and GC marker based on surrounding stages
  // We use a loop instead of map so that when processing I-485, we can see
  // PD wait's already-updated position (critical for correct sequencing)
  const finalStages: ComposedStage[] = [];
  
  for (let idx = 0; idx < adjustedStages.length; idx++) {
    const stage = adjustedStages[idx];
    
    if (stage.isPriorityWait) {
      // Position PD wait after the previous non-PD-wait stage on GC track
      const prevGcStages = finalStages.filter(s => s.track === "gc" && !s.isPriorityWait);
      if (prevGcStages.length > 0) {
        const lastGcStage = prevGcStages[prevGcStages.length - 1];
        const newStart = lastGcStage.startYear + lastGcStage.durationYears.max;
        finalStages.push({ ...stage, startYear: Math.max(0, newStart) });
      } else {
        finalStages.push(stage);
      }
      continue;
    }
    
    if (stage.nodeId === "i485") {
      // I-485 must come AFTER any PD wait stage
      // This fixes the overlap bug where both I-485 and PD wait were positioned
      // at trackEndYears[gc] (after I-140) when there's progress on the GC track
      const pdWaitStage = finalStages.find(s => s.isPriorityWait);
      if (pdWaitStage) {
        // Position I-485 after PD wait ends
        const pdWaitEnd = pdWaitStage.startYear + pdWaitStage.durationYears.max;
        finalStages.push({ ...stage, startYear: Math.max(0, pdWaitEnd), isConcurrent: false });
      } else {
        finalStages.push(stage);
      }
      continue;
    }
    
    if (stage.nodeId === "gc") {
      // Position GC marker at the end of the last GC track stage
      const gcStages = finalStages.filter(s => s.track === "gc" && s.nodeId !== "gc");
      if (gcStages.length > 0) {
        let maxEnd = 0;
        for (const s of gcStages) {
          const end = s.startYear + s.durationYears.max;
          maxEnd = Math.max(maxEnd, end);
        }
        finalStages.push({ ...stage, startYear: Math.max(0, maxEnd) });
      } else {
        finalStages.push(stage);
      }
      continue;
    }
    
    // All other stages: keep as-is from first pass
    finalStages.push(stage);
  }
  
  return finalStages;
}


export default function TimelineChart({
  onStageClick,
  filters,
  onMatchingCountChange,
  onSelectPath,
  onPathsGenerated,
  selectedPathId,
  globalProgress,
}: TimelineChartProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);
  const [processingTimesLoaded, setProcessingTimesLoaded] = useState(false);
  const [expandedMobilePathId, setExpandedMobilePathId] = useState<string | null>(null);
  // Initialize with defaults to prevent timeline flicker when API data loads
  // The defaults match what the API would return, so PD Wait stages render correctly from the start
  const [priorityDates, setPriorityDates] = useState<DynamicData["priorityDates"]>(DEFAULT_PRIORITY_DATES);
  const [datesForFiling, setDatesForFiling] = useState<DynamicData["datesForFiling"]>(DEFAULT_DATES_FOR_FILING);

  // Helper to get stage progress (now global - same stage data for all paths)
  const getStageProgress = (pathId: string, nodeId: string): StageProgress | null => {
    // Stage progress is global, not per-path
    return globalProgress?.stages[nodeId] || null;
  };

  // Fetch processing times on mount
  useEffect(() => {
    async function fetchTimes() {
      try {
        const response = await fetch("/api/processing-times");
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const adapted = adaptDynamicData(result.data);
            setProcessingTimes(adapted);
            // Final Action Dates - for determining when case will be approved
            setPriorityDates(result.data.priorityDates);
            // Dates for Filing - for determining when you can submit I-485
            setDatesForFiling(result.data.datesForFiling);
            setProcessingTimesLoaded(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch processing times:", error);
      }
    }
    fetchTimes();
  }, []);

  const years = Array.from({ length: MAX_YEARS + 1 }, (_, i) => i);

  // Get current status node for "you are here" highlighting
  const currentNodeId = statusToNodeId[filters.currentStatus];

  // Generate paths dynamically using the composer
  // Re-generate when processing times or priority dates are updated
  const paths = useMemo(() => {
    const generatedPaths = generatePaths(filters, priorityDates, datesForFiling);
    onMatchingCountChange(generatedPaths.length);
    return generatedPaths;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, onMatchingCountChange, processingTimesLoaded, priorityDates, datesForFiling]);

  // Notify parent when paths are regenerated (for updating selected path)
  useEffect(() => {
    if (paths.length > 0 && onPathsGenerated) {
      onPathsGenerated(paths);
    }
  }, [paths, onPathsGenerated]);

  // Sort paths with tracked path at top
  const sortedPaths = useMemo(() => {
    if (!selectedPathId) return paths;
    
    return [...paths].sort((a, b) => {
      if (a.id === selectedPathId) return -1;
      if (b.id === selectedPathId) return 1;
      return 0;
    });
  }, [paths, selectedPathId]);

  // Track paths generated for analytics (debounced to avoid duplicate events)
  const lastTrackedFilters = useRef<string>("");
  useEffect(() => {
    if (paths.length > 0) {
      // Create a simple hash of filter values to detect actual changes
      const filterHash = `${filters.education}-${filters.experience}-${filters.countryOfBirth}-${paths.length}`;
      if (filterHash !== lastTrackedFilters.current) {
        lastTrackedFilters.current = filterHash;
        trackPathsGenerated(paths.length, filters);
      }
    }
  }, [paths.length, filters]);

  // Handle stage click with analytics tracking
  // If clicking a stage on a non-tracked path, also select that path
  const handleStageClick = useCallback(
    (nodeId: string, path: ComposedPath) => {
      const node = getNode(nodeId);
      const nodeName = node?.name || nodeId;
      trackStageClick(nodeId, nodeName);
      
      // If this path isn't currently tracked, start tracking it
      if (selectedPathId !== path.id && onSelectPath) {
        onSelectPath(path);
      }
      
      onStageClick(nodeId);
    },
    [onStageClick, selectedPathId, onSelectPath]
  );

  // Check if a path has multiple tracks
  const hasMultipleTracks = (stages: ComposedStage[]) => {
    const tracks = new Set(stages.map((s) => s.track));
    return tracks.size > 1;
  };

  // Check if a path has concurrent GC stages (for extra height)
  const hasConcurrentStages = (stages: ComposedStage[]) => {
    return stages.some((s) => s.isConcurrent);
  };

  // Get node info from visa data
  const getNode = (nodeId: string) => {
    return visaData.nodes[nodeId as keyof typeof visaData.nodes];
  };
  
  // Calculate global timeline offset based on tracked path (or first path if none tracked)
  // This ensures all paths are aligned and "NOW" is at a consistent position
  const globalTimelineInfo = useMemo(() => {
    // Find the reference path (tracked path or first path)
    const referencePath = selectedPathId 
      ? paths.find(p => p.id === selectedPathId) 
      : paths[0];
    
    if (!referencePath || !globalProgress || Object.keys(globalProgress.stages).length === 0) {
      return { nowPosition: 0, hasProgress: false };
    }
    
    // Adjust the reference path's stages based on progress
    const adjustedStages = adjustStagesForProgress(referencePath.stages, globalProgress);
    
    // Find the earliest stage start (most negative = furthest in past)
    const nowPosition = calculateTimelineOffset(adjustedStages);
    
    return { nowPosition, hasProgress: true };
  }, [paths, selectedPathId, globalProgress]);

  const statusBadgeStyles: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-600",
    filed: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
  };

  const renderMobileStageCard = (
    path: ComposedPath,
    stage: ComposedStage,
    idx: number,
    isTracked: boolean,
    nextStageId: string | null
  ) => {
    const node = getNode(stage.nodeId);
    const nodeName = node?.name || stage.nodeId;
    const nodeCategory = node?.category || "work";
    const stageProgress = getStageProgress(path.id, stage.nodeId);
    const stageStatus = stageProgress?.status || "not_started";
    const isApproved = stageStatus === "approved";
    const isFiled = stageStatus === "filed";
    const hasProgress = isApproved || isFiled;
    const isCurrentStatus = stage.nodeId === currentNodeId;
    const isNextStep = isTracked && nextStageId === stage.nodeId;
    const isFinalGC = stage.nodeId === "gc";
    const isStatusVisaStage = isStatusVisa(stage.nodeId);
    const durationLabel = stage.durationYears.display ||
      `${stage.durationYears.min.toFixed(1)}-${stage.durationYears.max.toFixed(1)} yr`;
    const statusLabel = stage.isPriorityWait
      ? getPriorityWaitLabel(stage)
      : isFinalGC
      ? "Green Card"
      : stageStatus === "approved"
      ? "Approved"
      : stageStatus === "filed"
      ? "Filed"
      : "Not started";
    const statusClass = stage.isPriorityWait
      ? "bg-orange-100 text-orange-700"
      : isFinalGC
      ? "bg-green-100 text-green-700"
      : statusBadgeStyles[stageStatus];
    const accentClass = stage.isPriorityWait
      ? "border-l-4 border-l-orange-500"
      : isFinalGC
      ? "border-l-4 border-l-green-600"
      : `border-l-4 ${categoryAccents[nodeCategory] || "border-l-gray-300"}`;
    const progressPercent = isFiled && !isApproved
      ? getFiledProgress(stageProgress?.filedDate, (stage.durationYears?.max || 0.5) * 12)
      : 0;

    return (
      <button
        key={`${stage.nodeId}-${idx}`}
        type="button"
        className={`w-full text-left rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow ${accentClass}`}
        onClick={() => handleStageClick(stage.nodeId, path)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-gray-400">
              {trackLabels[stage.track]}
            </div>
            <div className="text-sm font-semibold text-gray-900">{nodeName}</div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusClass}`}>
              {statusLabel}
            </span>
            <span className="text-[10px] text-gray-500">{durationLabel}</span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
          <span>{formatStageTiming(stage.startYear)}</span>
          {stage.isConcurrent && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              Concurrent
            </span>
          )}
          {isCurrentStatus && !hasProgress && !isNextStep && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
              You are here
            </span>
          )}
          {isNextStep && (
            <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-semibold">
              Next step
            </span>
          )}
        </div>

        {isFiled && stageProgress?.filedDate && (
          <div className="mt-2 text-[10px] text-blue-700">
            Filed {formatDateForDisplay(stageProgress.filedDate)}
            {progressPercent > 0 && (
              <span className="text-blue-500"> • {Math.round(progressPercent)}% elapsed</span>
            )}
          </div>
        )}
        {isApproved && stageProgress?.approvedDate && (
          <div className="mt-2 text-[10px] text-green-700">
            Approved {formatDateForDisplay(stageProgress.approvedDate)}
            {isStatusVisaStage && (
              <span className="text-gray-500">
                {" "}
                (valid {Math.round((STATUS_VISA_VALIDITY_MONTHS[stage.nodeId] || 36) / 12)} yrs)
              </span>
            )}
          </div>
        )}
        {stageProgress?.receiptNumber && (
          <div className="mt-1 text-[10px] font-mono text-gray-500">
            {stageProgress.receiptNumber}
          </div>
        )}

        {stage.note && (
          <div className="mt-2 text-[11px] text-gray-600 leading-snug">
            {stage.note}
          </div>
        )}

        {stage.isPriorityWait && (
          <div className="mt-2 space-y-1 text-[10px] text-gray-600">
            {stage.priorityDateStr && (
              <div>Visa bulletin cutoff: {stage.priorityDateStr}</div>
            )}
            {stage.velocityInfo && stage.velocityInfo.rangeMin !== stage.velocityInfo.rangeMax && (
              <div>
                Estimated range: {Math.round(stage.velocityInfo.rangeMin / 12)}-
                {Math.round(stage.velocityInfo.rangeMax / 12)} yr
              </div>
            )}
          </div>
        )}
      </button>
    );
  };

  const getMiniStageColor = (stage: ComposedStage, progress?: StageProgress | null) => {
    if (stage.isPriorityWait) return "bg-orange-500";
    if (stage.nodeId === "gc") return "bg-green-600";
    if (progress?.status === "approved") return "bg-green-600";
    if (progress?.status === "filed") return "bg-blue-500";
    const node = getNode(stage.nodeId);
    const colors = node ? categoryColors[node.category] : categoryColors.work;
    return colors.bg;
  };

  return (
    <div className="w-full h-full bg-gray-50">
      {/* Mobile-first vertical timeline */}
      <div className="lg:hidden h-full overflow-y-auto">
        <div className="px-4 py-4 space-y-4">
          {selectedPathId && globalProgress && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] text-brand-700 flex items-start gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <span>Tap any step to edit details in the tracker.</span>
            </div>
          )}

          {sortedPaths.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              <p className="text-lg font-medium">No matching paths</p>
              <p className="text-sm mt-1">
                Try adjusting your criteria to see available immigration paths.
              </p>
            </div>
          )}

          {sortedPaths.map((path) => {
            const isTracked = selectedPathId === path.id;
            const isExpanded = expandedMobilePathId === path.id;
            const adjustedStages = adjustStagesForProgress(path.stages, globalProgress);
            const miniStages = shiftStagePositions(adjustedStages, calculateTimelineOffset(adjustedStages));
            const timelineEnd = Math.max(
              1,
              ...miniStages.map((stage) => stage.startYear + stage.durationYears.max)
            );
            const stagesWithIndex = adjustedStages.map((stage, index) => ({ stage, index }));
            const trackableStages = stagesWithIndex.filter(({ stage }) => !stage.isPriorityWait && stage.nodeId !== "gc");
            const nextStageId = isTracked
              ? trackableStages.find(({ stage }) => {
                  const sp = getStageProgress(path.id, stage.nodeId);
                  return !sp || sp.status !== "approved";
                })?.stage.nodeId || null
              : null;
            const statusStages = stagesWithIndex
              .filter(({ stage }) => stage.track === "status")
              .sort((a, b) => a.stage.startYear - b.stage.startYear || a.index - b.index);
            const gcStages = stagesWithIndex
              .filter(({ stage }) => stage.track === "gc")
              .sort((a, b) => a.stage.startYear - b.stage.startYear || a.index - b.index);
            const stageCount = trackableStages.length;

            return (
              <div
                key={path.id}
                className={`rounded-xl border bg-white shadow-sm ${
                  isTracked ? "border-brand-500 ring-1 ring-brand-100" : "border-gray-200"
                }`}
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{path.name}</h3>
                        {isTracked && (
                          <span className="text-[10px] font-semibold text-white bg-brand-600 px-2 py-0.5 rounded-full">
                            Tracking
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {path.gcCategory} • {path.totalYears.display}
                      </div>
                    </div>
                    {onSelectPath && (
                      <button
                        type="button"
                        onClick={() => onSelectPath(path)}
                        className={`px-3 py-1.5 text-[11px] font-semibold rounded-full transition-colors ${
                          isTracked
                            ? "bg-brand-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {isTracked ? "Tracking" : "Track"}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-gray-600">
                    <span className="px-2 py-1 bg-gray-100 rounded-full">
                      Time {path.totalYears.display}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 rounded-full">
                      Cost ${path.estimatedCost.toLocaleString()}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 rounded-full">
                      {stageCount} steps
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
                    <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                      {path.gcCategory}
                    </span>
                    {path.hasLottery && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Lottery
                      </span>
                    )}
                    {path.isSelfPetition && (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Self-file
                      </span>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-2">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Timeline snapshot
                    </div>
                    <div className="mt-2 space-y-2">
                      {(["status", "gc"] as const).map((track) => {
                        const trackStages = miniStages
                          .filter((stage) => stage.track === track)
                          .sort((a, b) => a.startYear - b.startYear);
                        if (trackStages.length === 0) return null;

                        return (
                          <div key={track} className="relative h-3">
                            <div className="absolute inset-0 rounded-full bg-gray-200" />
                            {trackStages.map((stage, index) => {
                              const left = Math.min(98, (stage.startYear / timelineEnd) * 100);
                              let width = Math.max(
                                2,
                                (stage.durationYears.max / timelineEnd) * 100
                              );
                              if (left + width > 100) {
                                width = Math.max(2, 100 - left);
                              }
                              const color = getMiniStageColor(
                                stage,
                                getStageProgress(path.id, stage.nodeId)
                              );
                              return (
                                <div
                                  key={`${stage.nodeId}-${index}`}
                                  className={`absolute top-0 h-3 rounded-full ${color}`}
                                  style={{
                                    left: `${left}%`,
                                    width: `${width}%`,
                                  }}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                      <span>Start</span>
                      <span>End</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpandedMobilePathId(isExpanded ? null : path.id)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                  >
                    {isExpanded ? "Hide steps" : "View steps"}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t bg-gray-50/70 px-4 py-4 space-y-4">
                    <div className="text-[11px] text-gray-600 leading-snug">
                      {path.description}
                    </div>

                    <div className="text-[10px] text-gray-500">
                      Tap a step to {isTracked ? "update progress" : "view details"}.
                    </div>

                    {statusStages.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            Status track
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {statusStages.length} steps
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {statusStages.map(({ stage, index }) =>
                            renderMobileStageCard(path, stage, index, isTracked, nextStageId)
                          )}
                        </div>
                      </div>
                    )}

                    {gcStages.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Green card track
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {gcStages.length} steps
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {gcStages.map(({ stage, index }) =>
                            renderMobileStageCard(path, stage, index, isTracked, nextStageId)
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop timeline */}
      <div className="hidden lg:block w-full h-full overflow-x-auto overflow-y-auto">
        <div className="min-w-[1200px] p-6">
        {/* Tracking instruction banner */}
        {selectedPathId && globalProgress && (
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2" style={{ marginLeft: "220px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>
              Click any stage to edit details in the panel →
            </span>
          </div>
        )}
        
        {/* Year markers */}
        <div className="flex mb-2" style={{ marginLeft: "220px" }}>
          {years.map((year) => (
            <div
              key={year}
              className="text-xs text-gray-500 font-medium"
              style={{ width: PIXELS_PER_YEAR, flexShrink: 0 }}
            >
              {globalTimelineInfo.hasProgress 
                ? (year === 0 ? "Start" : `+${year} yr`)
                : (year === 0 ? "Today" : `Year ${year}`)}
            </div>
          ))}
        </div>

        {/* Grid lines */}
        <div
          className="relative border-l border-gray-300"
          style={{ marginLeft: "220px" }}
        >
          <div className="absolute inset-0 flex pointer-events-none">
            {years.map((year) => (
              <div
                key={year}
                className="border-l border-gray-200"
                style={{ width: PIXELS_PER_YEAR, flexShrink: 0 }}
              />
            ))}
          </div>
          
          {/* NOW marker - vertical line showing where "today" is on the timeline */}
          {/* Position is based on the tracked path's offset */}
          {globalTimelineInfo.hasProgress && globalTimelineInfo.nowPosition > 0 && (
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-brand-500 z-20 pointer-events-none"
              style={{ left: `${globalTimelineInfo.nowPosition * PIXELS_PER_YEAR}px` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-brand-500 text-white text-[9px] font-bold rounded whitespace-nowrap">
                NOW
              </div>
            </div>
          )}

          {/* Path lanes */}
          <div className="relative py-4">
            {sortedPaths.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <p className="text-lg font-medium">No matching paths</p>
                <p className="text-sm mt-1">
                  Try adjusting your criteria to see available immigration paths.
                </p>
              </div>
            )}
            {sortedPaths.map((path, pathIndex) => {
              const isSelected = selectedPath === path.id;
              const isDimmed = selectedPath !== null && !isSelected;
              const isTracked = selectedPathId === path.id;
              const multiTrack = hasMultipleTracks(path.stages);
              const hasConcurrent = hasConcurrentStages(path.stages);
              // Add extra height if we have concurrent stages that need offset
              const pathHeight = multiTrack
                ? TRACK_HEIGHT * 2 + TRACK_GAP + (hasConcurrent ? CONCURRENT_OFFSET : 0)
                : TRACK_HEIGHT;

              return (
                <div
                  key={path.id}
                  className={`relative transition-all duration-200 group ${
                    isDimmed ? "opacity-40" : "opacity-100"
                  } ${isTracked ? "mb-6 mt-2" : "mb-6"}`}
                  style={{ height: pathHeight + 24 }}
                >
                  {/* Tracked path highlight background */}
                  {isTracked && (
                    <div 
                      className="absolute -inset-y-2 bg-brand-50 rounded-lg -z-10"
                      style={{ left: "-220px", right: "-16px" }}
                    />
                  )}
                  
                  {/* Path header - positioned to the left, clickable */}
                  <div className="absolute right-full mr-4 top-0 w-[200px]">
                    <div 
                      className={`text-right p-2 -m-2 rounded-lg cursor-pointer transition-colors ${
                        isTracked 
                          ? "bg-brand-500" 
                          : "hover:bg-gray-100"
                      }`}
                      onClick={() => onSelectPath?.(path)}
                    >
                      <div className="flex items-center justify-end gap-2 mb-0.5">
                        {isTracked ? (
                          <span className="flex items-center gap-1.5 text-[10px] text-white/90 font-medium">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            Tracking
                          </span>
                        ) : (
                          <span className="text-[10px] text-brand-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Click to track →
                          </span>
                        )}
                      </div>
                      <div className={`font-semibold text-sm leading-tight ${isTracked ? "text-white" : "text-gray-900"}`}>
                        {path.name}
                      </div>
                      <div className={`text-xs mt-0.5 ${isTracked ? "text-white/80" : "text-gray-500"}`}>
                        {path.totalYears.display} · ${path.estimatedCost.toLocaleString()}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-1">
                        <span className={`text-[10px] font-medium ${isTracked ? "text-white/90" : "text-brand-600"}`}>
                          {path.gcCategory}
                        </span>
                        {path.hasLottery && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isTracked ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                            lottery
                          </span>
                        )}
                        {path.isSelfPetition && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${isTracked ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>
                            self-file
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Track backgrounds */}
                  {multiTrack && (
                    <>
                      <div
                        className="absolute left-0 right-0 bg-emerald-50/50 rounded"
                        style={{ height: TRACK_HEIGHT, top: 0 }}
                      />
                      <div
                        className="absolute left-0 right-0 bg-amber-50/50 rounded"
                        style={{
                          height: TRACK_HEIGHT + (hasConcurrent ? CONCURRENT_OFFSET : 0),
                          top: TRACK_HEIGHT + TRACK_GAP,
                        }}
                      />
                    </>
                  )}

                  {/* Find current stage index (first non-approved stage) for tracked path */}
                  {(() => {
                    // Adjust stage positions based on actual progress (for ALL paths)
                    // Since progress data is global, all paths should reflect actual dates
                    const adjustedStages = adjustStagesForProgress(path.stages, globalProgress);
                    
                    // Use the global offset to shift all paths consistently
                    // This ensures "NOW" appears at the same position across all paths
                    const shiftedStages = shiftStagePositions(adjustedStages, globalTimelineInfo.nowPosition);
                    
                    // Calculate current stage for this path if it's being tracked
                    const currentStageIdx = isTracked ? shiftedStages.findIndex(s => {
                      if (s.isPriorityWait || s.nodeId === "gc") return false;
                      const sp = getStageProgress(path.id, s.nodeId);
                      return !sp || sp.status !== "approved";
                    }) : -1;
                    
                    const stageElements = shiftedStages.map((stage, idx) => {
                    const stageProgress = getStageProgress(path.id, stage.nodeId);
                    const isApproved = stageProgress?.status === "approved";
                    const isFiled = stageProgress?.status === "filed";
                    const hasProgress = isApproved || isFiled;
                    const isNextStep = isTracked && idx === currentStageIdx && !hasProgress;
                    
                    // Special rendering for priority date wait stages
                    if (stage.isPriorityWait) {
                      const pdStartYear = stage.startYear;
                      const pdDuration = stage.durationYears.max || 0.5;
                      const pdLeft = Math.max(0, pdStartYear * PIXELS_PER_YEAR);
                      const pdWidth = Math.max(60, pdDuration * PIXELS_PER_YEAR - 2);
                      const isHovered = hoveredStage === `${path.id}-${idx}`;

                      // Calculate top position (GC track)
                      let pdTop = multiTrack ? TRACK_HEIGHT + TRACK_GAP : 0;

                      // Color based on wait length (or gray if completed)
                      const waitYears = pdDuration;
                      let bgColor = isApproved ? "bg-gray-400" : "bg-orange-500";
                      let borderColor = isApproved ? "border-gray-500" : "border-orange-600";
                      if (!isApproved) {
                        if (waitYears >= 10) {
                          bgColor = "bg-red-600";
                          borderColor = "border-red-700";
                        } else if (waitYears >= 5) {
                          bgColor = "bg-red-500";
                          borderColor = "border-red-600";
                        }
                      }

                      return (
                        <div
                          key={`${stage.nodeId}-${idx}`}
                          className={`absolute rounded-lg cursor-pointer transition-all duration-200 border text-white shadow-sm
                            ${bgColor} ${borderColor}
                            ${isHovered ? "ring-2 ring-offset-2 ring-orange-400 scale-[1.03] z-30 shadow-lg" : "z-10 hover:shadow-md hover:scale-[1.01]"}
                          `}
                          style={{
                            left: `${pdLeft}px`,
                            width: `${pdWidth}px`,
                            height: TRACK_HEIGHT,
                            top: `${pdTop}px`,
                          }}
                          onClick={() => handleStageClick(stage.nodeId, path)}
                          onMouseEnter={() => setHoveredStage(`${path.id}-${idx}`)}
                          onMouseLeave={() => setHoveredStage(null)}
                        >
                          <div className="h-full px-2 flex flex-col justify-center overflow-hidden relative">
                            {isApproved && (
                              <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-green-600 font-bold text-sm">
                                ✓
                              </div>
                            )}
                            <div className={`font-semibold text-[10px] leading-tight truncate ${isApproved ? "line-through opacity-70" : ""}`}>
                              PD Wait
                            </div>
                            <div className={`text-[9px] opacity-90 leading-tight truncate ${isApproved ? "line-through" : ""}`}>
                              {stage.durationYears.display}
                            </div>
                          </div>

                          {/* Tooltip on hover */}
                          {isHovered && (
                            <div className="absolute top-full left-0 mt-1 bg-gray-900 text-white text-xs px-2 py-1.5 rounded shadow-lg z-40 max-w-sm">
                              {/* Determine if this is filing or approval wait based on note */}
                              {stage.note?.includes("Filing") || stage.note?.includes("Dates for Filing") ? (
                                <>
                                  <div className="font-semibold text-blue-400">📝 Filing Wait</div>
                                  <div className="text-gray-400 text-[10px] mb-1">
                                    Wait until you can FILE I-485
                                  </div>
                                </>
                              ) : stage.note?.includes("Final Action") || stage.note?.includes("approval") ? (
                                <>
                                  <div className="font-semibold text-green-400">✅ Approval Wait</div>
                                  <div className="text-gray-400 text-[10px] mb-1">
                                    I-485 pending. EAD/AP valid. Waiting for visa availability.
                                  </div>
                                </>
                              ) : (
                                <div className="font-semibold">Priority Date Wait</div>
                              )}
                              <div className="text-gray-300">
                                Estimated: {stage.durationYears.display}
                                {stage.velocityInfo && stage.velocityInfo.rangeMin !== stage.velocityInfo.rangeMax && (
                                  <span className="text-gray-400 text-[10px] ml-1">
                                    (range: {Math.round(stage.velocityInfo.rangeMin / 12)}-{Math.round(stage.velocityInfo.rangeMax / 12)} yr)
                                  </span>
                                )}
                              </div>
                              {stage.priorityDateStr && (
                                <div className="text-gray-400 text-[10px] mt-0.5">
                                  Visa bulletin cutoff: {stage.priorityDateStr}
                                </div>
                              )}
                              {stage.velocityInfo && (
                                <>
                                  <div className="text-amber-400 text-[10px] mt-1.5 leading-relaxed whitespace-normal">
                                    {stage.velocityInfo.explanation}
                                  </div>
                                  <div className="text-gray-500 text-[9px] mt-1 flex items-center gap-1">
                                    <span>📊</span>
                                    <span>Based on historical visa bulletin movement</span>
                                  </div>
                                  {stage.velocityInfo.confidence < 0.7 && (
                                    <div className="text-gray-500 text-[9px] italic">
                                      Estimate confidence: {Math.round(stage.velocityInfo.confidence * 100)}%
                                    </div>
                                  )}
                                </>
                              )}
                              {/* Benefits note for approval wait */}
                              {(stage.note?.includes("Final Action") || stage.note?.includes("EAD")) && (
                                <div className="text-green-400 text-[9px] mt-1.5 border-t border-gray-700 pt-1">
                                  ✓ EAD (work permit) • ✓ Advance Parole (travel) • ✓ AC21 portability
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    }

                    const node = getNode(stage.nodeId);
                    if (!node) return null;

                    const startYear = stage.startYear;
                    const duration = stage.durationYears.max || 0.5;
                    const track = stage.track;

                    // Calculate position directly (stages are already shifted to start at 0)
                    const left = Math.max(0, startYear * PIXELS_PER_YEAR);
                    const width = Math.max(24, duration * PIXELS_PER_YEAR - 2);
                    const isCompact = width < 50; // Compact mode for small stages

                    // Calculate vertical position based on track
                    let top = 0;
                    if (multiTrack) {
                      top = track === "gc" ? TRACK_HEIGHT + TRACK_GAP : 0;
                      // Offset concurrent stages down so they don't hide previous stages
                      if (stage.isConcurrent) {
                        top += CONCURRENT_OFFSET;
                      }
                    }

                    const colors = categoryColors[node.category] || categoryColors.work;
                    const isHovered = hoveredStage === `${path.id}-${idx}`;
                    const isCurrentStatus = stage.nodeId === currentNodeId;
                    const isFinalGC = stage.nodeId === "gc";

                    // Short name for compact stages - use shortName if available, otherwise truncate
                    const shortName = ("shortName" in node && node.shortName)
                      ? (node.shortName as string)
                      : (node.name.length > 8 ? node.name.substring(0, 6) + "…" : node.name);

                    // Determine stage visual style based on progress
                    let stageColorClass = `${colors.bg} ${colors.border} ${colors.text}`;
                    if (isApproved) {
                      stageColorClass = "bg-green-600 border-green-700 text-white";
                    } else if (isFiled) {
                      stageColorClass = "bg-blue-500 border-blue-600 text-white";
                    }

                    // Special rendering for the final Green Card destination
                    if (isFinalGC) {
                      const gcLeft = Math.max(0, startYear * PIXELS_PER_YEAR);
                      return (
                        <div
                          key={`${stage.nodeId}-${idx}`}
                          className={`absolute cursor-pointer transition-all duration-200
                            ${isHovered ? "scale-105 z-30" : "z-10 hover:scale-[1.02]"}
                          `}
                          style={{
                            left: `${gcLeft}px`,
                            top: `${top}px`,
                          }}
                          onClick={() => handleStageClick(stage.nodeId, path)}
                          onMouseEnter={() => setHoveredStage(`${path.id}-${idx}`)}
                          onMouseLeave={() => setHoveredStage(null)}
                        >
                          {/* Clean finish marker */}
                          <div
                            className={`h-8 px-4 rounded-full border-2 text-white font-bold text-xs flex items-center justify-center ${
                              isApproved 
                                ? "bg-green-600 border-green-700 shadow-md" 
                                : "bg-green-500 border-green-600 shadow-sm"
                            }`}
                          >
                            {isApproved && <span className="mr-1">✓</span>}
                            Green Card
                          </div>

                          {/* Tooltip on hover */}
                          {isHovered && (
                            <div className="absolute top-full left-0 mt-2 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap z-40">
                              <div className="font-semibold">Permanent Resident</div>
                              <div className="text-gray-400 text-[10px] mt-0.5">No renewal required</div>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Calculate progress for filed stages
                    const durationMonths = (stage.durationYears?.max || 0.5) * 12;
                    const progressPercent = isFiled && !isApproved 
                      ? getFiledProgress(stageProgress?.filedDate, durationMonths)
                      : 0;
                    
                    return (
                      <div
                            key={`${stage.nodeId}-${idx}`}
                            className={`absolute rounded-lg cursor-pointer transition-all duration-200 border overflow-hidden shadow-sm
                              ${stageColorClass}
                              ${isHovered ? "ring-2 ring-offset-2 ring-brand-400 scale-[1.03] z-30 shadow-lg" : "z-10 hover:shadow-md hover:scale-[1.01]"}
                              ${isCurrentStatus && !hasProgress && !isNextStep ? "ring-2 ring-offset-2 ring-red-500 shadow-red-200" : ""}
                              ${isNextStep ? "ring-2 ring-offset-2 ring-brand-500 shadow-brand-200" : ""}
                            `}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                              height: TRACK_HEIGHT,
                              top: `${top}px`,
                            }}
                            onClick={() => handleStageClick(stage.nodeId, path)}
                            onMouseEnter={() => setHoveredStage(`${path.id}-${idx}`)}
                            onMouseLeave={() => setHoveredStage(null)}
                          >
                            {/* Progress fill for filed stages */}
                            {isFiled && !isApproved && progressPercent > 0 && (
                              <div 
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-700/40 to-blue-600/20 rounded-l"
                                style={{ width: `${progressPercent}%` }}
                              />
                            )}
                            
                            <div className="h-full px-1.5 flex flex-col justify-center overflow-hidden relative z-10">
                              {/* Current status indicator (from profile) */}
                              {isCurrentStatus && !hasProgress && !isNextStep && (
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                                  YOU ARE HERE
                                </div>
                              )}
                              {/* Next step indicator (when tracking) */}
                              {isNextStep && (
                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap animate-pulse">
                                  NEXT
                                </div>
                              )}
                              {isApproved && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-green-600 font-bold text-sm">
                                  ✓
                                </div>
                              )}
                              {isFiled && !isApproved && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-blue-600 text-[9px] font-bold">
                                  FILED
                                </div>
                              )}
                              {isCompact ? (
                                // Compact: just show abbreviated name
                                <div className="font-semibold text-[9px] leading-none text-center truncate">
                                  {shortName}
                                </div>
                              ) : (
                                // Full: show name and duration
                                <>
                                  <div className="font-semibold text-[10px] leading-tight truncate">
                                    {node.name}
                                  </div>
                                  <div className="text-[9px] opacity-90 leading-tight truncate">
                                    {isApproved && stageProgress?.approvedDate 
                                      ? `Done ${formatDateShort(stageProgress.approvedDate)}`
                                      : isFiled && stageProgress?.filedDate
                                      ? `Filed ${formatDateShort(stageProgress.filedDate)}`
                                      : stage.durationYears.display
                                    }
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Tooltip on hover */}
                            {isHovered && (
                              <div className="absolute top-full left-0 mt-1 bg-gray-900 text-white text-xs px-2 py-1.5 rounded shadow-lg z-40 min-w-[180px]">
                                <div className="font-semibold">{node.name}</div>
                                {hasProgress ? (
                                  <>
                                    <div className={`text-xs mt-1 ${isApproved ? "text-green-400" : "text-blue-400"}`}>
                                      {isApproved ? "✓ Approved" : `⏳ Filed - ${Math.round(progressPercent)}% elapsed`}
                                    </div>
                                    {stageProgress?.filedDate && (
                                      <div className="text-gray-400 text-[10px]">
                                        Filed: {formatDateForDisplay(stageProgress.filedDate)}
                                      </div>
                                    )}
                                    {stageProgress?.approvedDate && (
                                      <div className="text-gray-400 text-[10px]">
                                        Approved: {formatDateForDisplay(stageProgress.approvedDate)}
                                      </div>
                                    )}
                                    {stageProgress?.receiptNumber && (
                                      <div className="text-gray-400 text-[10px] font-mono">
                                        {stageProgress.receiptNumber}
                                      </div>
                                    )}
                                    {isTracked && (
                                      <div className="text-brand-400 text-[10px] mt-1 border-t border-gray-700 pt-1">
                                        Click to edit →
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="text-gray-300">{stage.durationYears.display}</div>
                                    {stage.note && <div className="text-gray-400 text-[10px] mt-0.5">{stage.note}</div>}
                                    {isTracked && (
                                      <div className="text-brand-400 text-[10px] mt-1 border-t border-gray-700 pt-1">
                                        Click to add details →
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                      </div>
                    );
                  });
                    
                    return stageElements;
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend + Disclaimer */}
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-6 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500" />
              <span className="text-sm text-gray-600">Work Status</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-500" />
              <span className="text-sm text-gray-600">GC Process</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-500" />
              <span className="text-sm text-gray-600">Filed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-600" />
              <span className="text-sm text-gray-600">Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-500" />
              <span className="text-sm text-gray-600">PD Wait</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            Live data from DOL, USCIS, and State Dept. Timelines are estimates. Consult an immigration attorney for your situation.
          </p>
        </div>

      </div>
    </div>
    </div>
  );
}
