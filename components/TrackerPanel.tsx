"use client";

import { useEffect, useRef, useMemo } from "react";
import { ComposedPath, ComposedStage } from "@/lib/path-composer";
import { GlobalProgress, StageProgress } from "@/app/page";
import visaData from "@/data/visa-paths.json";
import { 
  canEstablishPriorityDate, 
  PRIORITY_DATE_STAGES,
  isStatusVisa,
  STATUS_VISA_VALIDITY_MONTHS,
  STATUS_VISA_PROCESSING_MONTHS,
} from "@/lib/constants";

interface TrackerPanelProps {
  path: ComposedPath;
  progress: GlobalProgress;
  onUpdateStage: (nodeId: string, update: Partial<StageProgress>) => void;
  onUpdatePortedPD: (date: string | null, category: string | null) => void;
  onClose: () => void;
  expandedStageId: string | null;
  onExpandStage: (nodeId: string | null) => void;
}

// Get node info from visa data
function getNode(nodeId: string) {
  return visaData.nodes[nodeId as keyof typeof visaData.nodes];
}

// Parse YYYY-MM-DD to Date
function parseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
}

// Format date for display (input is YYYY-MM-DD string)
function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "";
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Calculate time elapsed since a date (input is YYYY-MM-DD string)
function timeElapsed(dateStr?: string): string {
  const date = parseDate(dateStr);
  if (!date) return "";
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return "in the future";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  }
  const years = (diffDays / 365).toFixed(1);
  return `${years} years ago`;
}

// Calculate months between two dates
function monthsBetween(date1: Date, date2: Date): number {
  return (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24 * 30);
}

// Format months for display
function formatMonthsRemaining(months: number): string {
  if (months <= 0) return "any day now";
  if (months < 1) return "< 1 month";
  if (months < 12) return `~${Math.round(months)} month${Math.round(months) !== 1 ? "s" : ""}`;
  const years = months / 12;
  if (years < 2) return `~${Math.round(months)} months`;
  return `~${years.toFixed(1)} years`;
}

// Use centralized constants from lib/constants.ts for status visa handling
// Stage durations come from path.stages.durationYears (from path-composer)

// Stage item component
function StageItem({
  stage,
  stageProgress,
  onUpdate,
  isExpanded,
  onToggleExpand,
  isCurrentStage,
}: {
  stage: ComposedStage;
  stageProgress: StageProgress;
  onUpdate: (update: Partial<StageProgress>) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isCurrentStage: boolean;
}) {
  const node = getNode(stage.nodeId);
  const nodeName = node?.name || stage.nodeId;
  const canHavePriorityDateVal = canEstablishPriorityDate(stage.nodeId);
  
  // Skip the final green card stage - it's implied
  if (stage.nodeId === "gc") return null;
  
  // Skip PD wait stages - they're informational
  if (stage.isPriorityWait) return null;

  // Calculate remaining time for filed stages
  // For status visas, this is the processing time to get approved
  // For processing steps, this is the time until completion
  const remainingTime = useMemo(() => {
    if (stageProgress.status !== "filed" || !stageProgress.filedDate) return null;
    
    const filedDate = parseDate(stageProgress.filedDate);
    if (!filedDate) return null;
    
    const now = new Date();
    const monthsElapsed = monthsBetween(filedDate, now);
    
    // For status visas, use the shorter processing time (not validity period)
    if (isStatusVisa(stage.nodeId)) {
      const processingMonths = STATUS_VISA_PROCESSING_MONTHS[stage.nodeId] || 3;
      const remaining = Math.max(0, processingMonths - monthsElapsed);
      return {
        elapsed: monthsElapsed,
        remaining,
        typical: { min: processingMonths * 0.5, max: processingMonths * 1.5 },
        isStatusVisa: true,
      };
    }
    
    // For processing steps, use the path's stage duration for consistency
    const stageMaxMonths = (stage.durationYears?.max || 0) * 12;
    if (stageMaxMonths === 0) return null;
    
    const remaining = Math.max(0, stageMaxMonths - monthsElapsed);
    
    return {
      elapsed: monthsElapsed,
      remaining,
      typical: { min: stageMaxMonths * 0.7, max: stageMaxMonths },
      isStatusVisa: false,
    };
  }, [stageProgress.status, stageProgress.filedDate, stage.nodeId]);

  const statusColors = {
    not_started: "bg-gray-100 text-gray-600 border-gray-200",
    filed: "bg-blue-100 text-blue-700 border-blue-200",
    approved: "bg-green-100 text-green-700 border-green-200",
  };

  const statusIcons = {
    not_started: (
      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${isCurrentStage ? "border-brand-500 bg-brand-50" : "border-gray-300"}`} />
    ),
    filed: (
      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
          <circle cx="12" cy="12" r="4" fill="white" />
        </svg>
      </div>
    ),
    approved: (
      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    ),
  };

  return (
    <div 
      className={`border-b border-gray-100 last:border-0 ${isExpanded ? "bg-brand-50/30" : ""} ${isCurrentStage && stageProgress.status === "not_started" ? "ring-2 ring-inset ring-brand-300" : ""}`}
      id={`stage-${stage.nodeId}`}
    >
      {/* Current stage indicator */}
      {isCurrentStage && stageProgress.status === "not_started" && (
        <div className="bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 text-center">
          → NEXT STEP
        </div>
      )}
      
      {/* Stage header - always visible */}
      <button
        onClick={onToggleExpand}
        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
          isExpanded ? "bg-gray-50" : ""
        }`}
      >
        {statusIcons[stageProgress.status]}
        
        <div className="flex-1 text-left min-w-0">
          <div className="font-medium text-gray-900 text-sm">{nodeName}</div>
          {stageProgress.status === "filed" && remainingTime && (
            <div className="text-xs text-blue-600">
              ~{formatMonthsRemaining(remainingTime.remaining)} remaining
            </div>
          )}
          {stageProgress.status === "filed" && stageProgress.filedDate && !remainingTime && (
            <div className="text-xs text-gray-500">
              Filed {formatDateDisplay(stageProgress.filedDate)} ({timeElapsed(stageProgress.filedDate)})
            </div>
          )}
          {stageProgress.status === "approved" && stageProgress.approvedDate && (
            <div className="text-xs text-green-600">
              ✓ Approved {formatDateDisplay(stageProgress.approvedDate)}
              {isStatusVisa(stage.nodeId) && (
                <span className="text-gray-500 ml-1">
                  (valid {STATUS_VISA_VALIDITY_MONTHS[stage.nodeId] / 12} yrs)
                </span>
              )}
            </div>
          )}
          {stageProgress.receiptNumber && (
            <div className="text-[10px] font-mono text-gray-500">{stageProgress.receiptNumber}</div>
          )}
        </div>

        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 bg-gray-50">
          {/* Status selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
            <div className="flex gap-2">
              {(["not_started", "filed", "approved"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => onUpdate({ status })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    stageProgress.status === status
                      ? statusColors[status]
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {status === "not_started" ? "Not Started" : status === "filed" ? "Filed" : "Approved"}
                </button>
              ))}
            </div>
          </div>

          {/* Filed date */}
          {(stageProgress.status === "filed" || stageProgress.status === "approved") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Filed Date</label>
              <input
                type="date"
                value={stageProgress.filedDate || ""}
                onChange={(e) => onUpdate({ filedDate: e.target.value || undefined })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              {remainingTime && stageProgress.status === "filed" && (
                <p className="text-[10px] text-blue-600 mt-1">
                  {Math.round(remainingTime.elapsed)} months elapsed • typical: {remainingTime.typical.min}-{remainingTime.typical.max} months
                </p>
              )}
            </div>
          )}

          {/* Approved date */}
          {stageProgress.status === "approved" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Approved Date</label>
              <input
                type="date"
                value={stageProgress.approvedDate || ""}
                onChange={(e) => onUpdate({ approvedDate: e.target.value || undefined })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          )}

          {/* Receipt number */}
          {(stageProgress.status === "filed" || stageProgress.status === "approved") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Receipt Number
                <span className="text-gray-400 font-normal ml-1">(e.g., EAC2490012345)</span>
              </label>
              <input
                type="text"
                value={stageProgress.receiptNumber || ""}
                onChange={(e) => onUpdate({ receiptNumber: e.target.value || undefined })}
                placeholder="Enter receipt number"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          )}

          {/* Priority date (for I-140, PERM, etc.) */}
          {canHavePriorityDateVal && stageProgress.status === "approved" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Priority Date
                <span className="text-gray-400 font-normal ml-1">(from approval notice)</span>
              </label>
              <input
                type="date"
                value={stageProgress.priorityDate || ""}
                onChange={(e) => onUpdate({ priorityDate: e.target.value || undefined })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                This establishes when you entered the queue for a green card.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notes</label>
            <textarea
              value={stageProgress.notes || ""}
              onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
              placeholder="Any additional notes..."
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrackerPanel({
  path,
  progress,
  onUpdateStage,
  onUpdatePortedPD,
  onClose,
  expandedStageId,
  onExpandStage,
}: TrackerPanelProps) {
  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to expanded stage when it changes
  useEffect(() => {
    if (expandedStageId && stageRefs.current[expandedStageId] && scrollContainerRef.current) {
      const element = stageRefs.current[expandedStageId];
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      }
    }
  }, [expandedStageId]);

  // Filter out PD wait and GC stages for tracking
  const trackableStages = path.stages.filter(
    (s) => !s.isPriorityWait && s.nodeId !== "gc"
  );

  // Find current stage (first non-approved stage)
  const currentStageIndex = trackableStages.findIndex(stage => {
    const sp = progress.stages[stage.nodeId];
    return !sp || sp.status !== "approved";
  });

  // Calculate summary
  const stageSummary = trackableStages.reduce(
    (acc, stage) => {
      const stageProgress = progress.stages[stage.nodeId] || { status: "not_started" };
      if (stageProgress.status === "approved") acc.approved++;
      else if (stageProgress.status === "filed") acc.filed++;
      else acc.notStarted++;
      return acc;
    },
    { notStarted: 0, filed: 0, approved: 0 }
  );

  // Find priority date from current path's approved I-140 or equivalent
  const currentPathPD = useMemo(() => {
    for (const nodeId of Array.from(PRIORITY_DATE_STAGES)) {
      const stageProgress = progress.stages[nodeId];
      if (stageProgress?.status === "approved" && stageProgress.priorityDate) {
        return { date: stageProgress.priorityDate, source: getNode(nodeId)?.name || nodeId };
      }
    }
    return null;
  }, [progress.stages]);

  // Effective priority date (earlier of ported vs current)
  const effectivePD = useMemo(() => {
    if (progress.portedPriorityDate && currentPathPD?.date) {
      return progress.portedPriorityDate < currentPathPD.date 
        ? { date: progress.portedPriorityDate, source: "Ported from previous case" }
        : currentPathPD;
    }
    if (progress.portedPriorityDate) {
      return { date: progress.portedPriorityDate, source: "Ported from previous case" };
    }
    return currentPathPD;
  }, [progress.portedPriorityDate, currentPathPD]);

  // Calculate estimated completion based on ACTUAL progress and remaining stages
  // MUST use the same stage durations as the timeline (path.stages.durationYears.max)
  const estimatedCompletion = useMemo(() => {
    const now = new Date();
    
    // Only count GC track stages (not status track like TN/H-1B)
    const gcStages = path.stages.filter(s => s.track === "gc" && s.nodeId !== "gc" && !s.isPriorityWait);
    
    // Check if there's any progress on GC track stages
    // This determines whether we use original startYear or chain from progress
    const hasGcProgress = gcStages.some(s => {
      const sp = progress.stages[s.nodeId];
      return sp && (sp.status === "filed" || sp.status === "approved");
    });
    
    // Find earliest GC stage startYear from path composition
    // This is when the GC process can BEGIN (e.g., year 2 for Student → NIW)
    const earliestGcStartYear = gcStages.length > 0 
      ? Math.min(...gcStages.map(s => s.startYear || 0))
      : 0;
    
    // Track time like path-composer does:
    // - gcSequentialMonths: when the next sequential stage starts
    // - gcMaxEndMonths: the latest end time across all stages
    // Concurrent stages start at the SAME time as the PREVIOUS stage
    //
    // KEY: If there's NO progress on GC track, use the original startYear to account
    // for paths where GC can't start until status stages complete (e.g., Student → NIW)
    let gcSequentialMonths = hasGcProgress ? 0 : earliestGcStartYear * 12;
    let gcMaxEndMonths = hasGcProgress ? 0 : earliestGcStartYear * 12;
    let prevStageStartMonths = hasGcProgress ? 0 : earliestGcStartYear * 12;
    
    for (let i = 0; i < gcStages.length; i++) {
      const stage = gcStages[i];
      const sp = progress.stages[stage.nodeId] || { status: "not_started" };
      
      // Use the PATH's duration (matches timeline), not centralized constants
      const stageMaxMonths = (stage.durationYears?.max || 0) * 12;
      
      let stageRemainingMonths = 0;
      
      if (sp.status === "approved") {
        // Stage fully completed - no remaining time for this stage
        stageRemainingMonths = 0;
      } else if (sp.status === "filed" && sp.filedDate) {
        // Partially completed - calculate remaining time
        const filedDate = parseDate(sp.filedDate);
        if (filedDate) {
          const elapsedMonths = monthsBetween(filedDate, now);
          stageRemainingMonths = Math.max(0, stageMaxMonths - elapsedMonths);
        }
      } else {
        // Not started - full duration
        stageRemainingMonths = stageMaxMonths;
      }
      
      // Concurrent stages start at the SAME time as the previous stage
      // (matching path-composer.ts logic at line 724-726)
      const stageStartMonths = stage.isConcurrent 
        ? prevStageStartMonths 
        : gcSequentialMonths;
      
      const stageEndMonths = stageStartMonths + stageRemainingMonths;
      
      // Update for next iteration
      prevStageStartMonths = stageStartMonths;
      gcSequentialMonths = Math.max(gcSequentialMonths, stageEndMonths);
      gcMaxEndMonths = Math.max(gcMaxEndMonths, stageEndMonths);
    }
    
    let remainingMonths = gcMaxEndMonths;
    
    // Add PD wait time if exists (from path composition)
    const pdWaitStage = path.stages.find(s => s.isPriorityWait);
    if (pdWaitStage) {
      const pdWaitMonths = (pdWaitStage.durationYears?.max || 0) * 12;
      remainingMonths += pdWaitMonths;
    }
    
    // Check for uncertainty (PD wait stages exist)
    const hasUncertainty = !!pdWaitStage;

    // Calculate estimated date
    const estimatedDate = new Date(now);
    estimatedDate.setMonth(estimatedDate.getMonth() + Math.round(remainingMonths));

    return {
      date: estimatedDate,
      months: remainingMonths,
      hasUncertainty,
    };
  }, [path.stages, progress.stages]);

  // Priority date aging benefit
  const pdAgingBenefit = useMemo(() => {
    if (!effectivePD?.date) return null;
    
    // Find how long until we need the PD (I-485 filing stage)
    let monthsUntilI485 = 0;
    const now = new Date();
    
    for (const stage of trackableStages) {
      if (stage.nodeId === "i485") break;
      
      const sp = progress.stages[stage.nodeId] || { status: "not_started" };
      // Use path's stage duration for consistency
      const stageMaxMonths = (stage.durationYears?.max || 0) * 12;
      
      if (sp.status === "approved") continue;
      
      if (sp.status === "filed" && sp.filedDate) {
        const filedDate = parseDate(sp.filedDate);
        if (filedDate && stageMaxMonths > 0) {
          const elapsed = monthsBetween(filedDate, now);
          monthsUntilI485 += Math.max(0, stageMaxMonths - elapsed);
        }
      } else if (stageMaxMonths > 0) {
        monthsUntilI485 += stageMaxMonths;
      }
    }

    if (monthsUntilI485 < 6) return null; // Not significant

    const pdDate = parseDate(effectivePD.date);
    if (!pdDate) return null;

    // How old will the PD be when we reach I-485?
    const pdAgeNow = monthsBetween(pdDate, now);
    const pdAgeAtI485 = pdAgeNow + monthsUntilI485;

    return {
      currentAge: Math.round(pdAgeNow),
      futureAge: Math.round(pdAgeAtI485),
      monthsGained: Math.round(monthsUntilI485),
    };
  }, [effectivePD, trackableStages, progress.stages]);

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        onClick={onClose}
      />
      
      {/* Panel - fixed on mobile, side panel on desktop */}
      <div className="fixed inset-y-0 right-0 w-full max-w-[400px] bg-white border-l border-gray-200 flex flex-col overflow-hidden z-50 lg:relative lg:w-[380px] lg:z-auto shadow-xl lg:shadow-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">Track Progress</h2>
          <p className="text-xs text-gray-500">{path.name}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Estimated Completion */}
      <div className="px-4 py-3 border-b border-gray-200 bg-brand-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estimated Green Card</div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">
              {estimatedCompletion.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">Remaining</div>
            <div className="text-sm font-semibold text-brand-700">
              {formatMonthsRemaining(estimatedCompletion.months)}
            </div>
          </div>
        </div>
        {estimatedCompletion.hasUncertainty && (
          <p className="text-[10px] text-gray-500 mt-1.5">
            * Estimate includes uncertain factors like visa bulletin wait
          </p>
        )}
      </div>

      {/* Priority Date Section */}
      <div className="px-4 py-3 border-b border-gray-200 bg-amber-50/50 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Priority Date</h3>
          {effectivePD && (
            <span className="text-xs text-amber-700 font-medium">
              {formatDateDisplay(effectivePD.date)}
            </span>
          )}
        </div>
        
        {effectivePD ? (
          <>
            <div className="text-xs text-gray-600">
              <span className="text-amber-800 font-medium">{effectivePD.source}</span>
              <span className="text-gray-500 ml-1">({timeElapsed(effectivePD.date)})</span>
            </div>
            
            {/* PD Aging Benefit */}
            {pdAgingBenefit && (
              <div className="mt-2 p-2 bg-green-100 border border-green-200 rounded text-xs">
                <div className="font-medium text-green-800">PD Aging Benefit</div>
                <div className="text-green-700 mt-0.5">
                  Your PD will be <strong>{pdAgingBenefit.futureAge} months old</strong> by the time you file I-485
                  (+{pdAgingBenefit.monthsGained} months closer to being current)
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500">
            No priority date yet. Established when I-140 is approved.
          </p>
        )}

        {/* Ported PD input */}
        <details className="mt-2">
          <summary className="text-xs text-brand-600 cursor-pointer hover:text-brand-700">
            {progress.portedPriorityDate ? "Edit ported PD" : "Have a PD from a previous employer?"}
          </summary>
          <div className="mt-2 p-3 bg-white rounded-lg border border-gray-200 space-y-2">
            <p className="text-[10px] text-gray-500">
              If you have an approved I-140 from a <strong>previous employer</strong>, you can port that priority date to your new case.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority Date</label>
              <input
                type="date"
                value={progress.portedPriorityDate || ""}
                onChange={(e) => onUpdatePortedPD(e.target.value || null, progress.portedPriorityDateCategory || null)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={progress.portedPriorityDateCategory || ""}
                onChange={(e) => onUpdatePortedPD(progress.portedPriorityDate || null, e.target.value || null)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Select category</option>
                <option value="eb1">EB-1</option>
                <option value="eb2">EB-2</option>
                <option value="eb3">EB-3</option>
              </select>
            </div>
            {progress.portedPriorityDate && (
              <button
                onClick={() => onUpdatePortedPD(null, null)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Remove ported PD
              </button>
            )}
          </div>
        </details>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">{stageSummary.approved} done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-gray-600">{stageSummary.filed} pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-gray-300" />
            <span className="text-gray-600">{stageSummary.notStarted} to go</span>
          </div>
        </div>
      </div>

      {/* Stage list */}
      <div className="flex-1 overflow-y-auto min-h-0" ref={scrollContainerRef}>
        {trackableStages.map((stage, index) => {
          const stageProgress = progress.stages[stage.nodeId] || { status: "not_started" };
          const isCurrentStage = index === currentStageIndex;
          
          return (
            <div 
              key={stage.nodeId} 
              ref={(el) => { stageRefs.current[stage.nodeId] = el; }}
            >
              <StageItem
                stage={stage}
                stageProgress={stageProgress}
                onUpdate={(update) => onUpdateStage(stage.nodeId, update)}
                isExpanded={expandedStageId === stage.nodeId}
                onToggleExpand={() => onExpandStage(
                  expandedStageId === stage.nodeId ? null : stage.nodeId
                )}
                isCurrentStage={isCurrentStage}
              />
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <p className="text-[10px] text-gray-500">
          Click stages in timeline to edit. Dates update your estimated completion.
        </p>
      </div>
    </div>
    </>
  );
}
