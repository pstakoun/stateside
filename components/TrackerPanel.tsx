"use client";

import { useEffect, useRef, useMemo } from "react";
import { ComposedPath, ComposedStage } from "@/lib/path-composer";
import { GlobalProgress, StageProgress } from "@/app/page";
import visaData from "@/data/visa-paths.json";

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

// Stages that can establish priority dates
const PRIORITY_DATE_STAGES = ["i140", "perm", "eb2niw", "eb1a", "eb1b", "eb1c"];

// Typical processing times in months for estimation
const TYPICAL_PROCESSING_MONTHS: Record<string, { min: number; max: number }> = {
  pwd: { min: 5, max: 8 },
  recruit: { min: 2, max: 3 },
  perm: { min: 12, max: 18 },
  i140: { min: 6, max: 12 },
  i485: { min: 8, max: 24 },
  eb1a: { min: 6, max: 12 },
  eb1b: { min: 6, max: 12 },
  eb1c: { min: 6, max: 12 },
  eb2niw: { min: 6, max: 15 },
};

// Stage item component
function StageItem({
  stage,
  stageProgress,
  onUpdate,
  isExpanded,
  onToggleExpand,
  stageRef,
  isCurrentStage,
}: {
  stage: ComposedStage;
  stageProgress: StageProgress;
  onUpdate: (update: Partial<StageProgress>) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  stageRef: React.RefObject<HTMLDivElement>;
  isCurrentStage: boolean;
}) {
  const node = getNode(stage.nodeId);
  const nodeName = node?.name || stage.nodeId;
  const canHavePriorityDate = PRIORITY_DATE_STAGES.includes(stage.nodeId);
  
  // Skip the final green card stage - it's implied
  if (stage.nodeId === "gc") return null;
  
  // Skip PD wait stages - they're informational
  if (stage.isPriorityWait) return null;

  // Calculate remaining time for filed stages
  const remainingTime = useMemo(() => {
    if (stageProgress.status !== "filed" || !stageProgress.filedDate) return null;
    
    const filedDate = parseDate(stageProgress.filedDate);
    if (!filedDate) return null;
    
    const typical = TYPICAL_PROCESSING_MONTHS[stage.nodeId];
    if (!typical) return null;
    
    const now = new Date();
    const monthsElapsed = monthsBetween(filedDate, now);
    const avgProcessing = (typical.min + typical.max) / 2;
    const remaining = Math.max(0, avgProcessing - monthsElapsed);
    
    return {
      elapsed: monthsElapsed,
      remaining,
      typical,
    };
  }, [stageProgress.status, stageProgress.filedDate, stage.nodeId]);

  const statusColors = {
    not_started: "bg-gray-100 text-gray-600 border-gray-200",
    filed: "bg-blue-100 text-blue-700 border-blue-200",
    approved: "bg-green-100 text-green-700 border-green-200",
  };

  const statusIcons = {
    not_started: (
      <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 transition-all ${isCurrentStage ? "border-brand-500 bg-brand-50 shadow-sm shadow-brand-500/20" : "border-gray-300"}`} />
    ),
    filed: (
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/30">
        <div className="w-2 h-2 bg-white rounded-full" />
      </div>
    ),
    approved: (
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-green-500/30">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
    ),
  };

  return (
    <div 
      ref={stageRef}
      className={`border-b border-gray-100 last:border-0 transition-all duration-200 ${isExpanded ? "bg-gradient-to-r from-brand-50/50 to-transparent" : ""} ${isCurrentStage && stageProgress.status === "not_started" ? "ring-2 ring-inset ring-brand-200 bg-brand-50/30" : ""}`}
      id={`stage-${stage.nodeId}`}
    >
      {/* Current stage indicator */}
      {isCurrentStage && stageProgress.status === "not_started" && (
        <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white text-[10px] font-bold px-3 py-1 text-center tracking-wide">
          → NEXT STEP
        </div>
      )}
      
      {/* Stage header - always visible */}
      <button
        onClick={onToggleExpand}
        className={`w-full px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/80 transition-all duration-200 ${
          isExpanded ? "bg-gray-50/50" : ""
        }`}
      >
        {statusIcons[stageProgress.status]}
        
        <div className="flex-1 text-left min-w-0">
          <div className="font-semibold text-gray-900 text-sm">{nodeName}</div>
          {stageProgress.status === "filed" && remainingTime && (
            <div className="text-xs text-blue-600 font-medium mt-0.5">
              ⏳ ~{formatMonthsRemaining(remainingTime.remaining)} remaining
            </div>
          )}
          {stageProgress.status === "filed" && stageProgress.filedDate && !remainingTime && (
            <div className="text-xs text-gray-500 mt-0.5">
              Filed {formatDateDisplay(stageProgress.filedDate)} • {timeElapsed(stageProgress.filedDate)}
            </div>
          )}
          {stageProgress.status === "approved" && stageProgress.approvedDate && (
            <div className="text-xs text-green-600 font-medium mt-0.5">
              ✓ Approved {formatDateDisplay(stageProgress.approvedDate)}
            </div>
          )}
          {stageProgress.receiptNumber && (
            <div className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-1">{stageProgress.receiptNumber}</div>
          )}
        </div>

        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-4 bg-gradient-to-b from-gray-50/80 to-white">
          {/* Status selector */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Status</label>
            <div className="flex gap-2">
              {(["not_started", "filed", "approved"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => onUpdate({ status })}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl border-2 transition-all duration-200 ${
                    stageProgress.status === status
                      ? status === "not_started" 
                        ? "bg-gray-100 text-gray-700 border-gray-300 shadow-sm"
                        : status === "filed"
                        ? "bg-blue-50 text-blue-700 border-blue-300 shadow-sm shadow-blue-500/20"
                        : "bg-green-50 text-green-700 border-green-300 shadow-sm shadow-green-500/20"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  {status === "not_started" ? "Not Started" : status === "filed" ? "📋 Filed" : "✓ Approved"}
                </button>
              ))}
            </div>
          </div>

          {/* Filed date */}
          {(stageProgress.status === "filed" || stageProgress.status === "approved") && (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Filed Date</label>
              <input
                type="date"
                value={stageProgress.filedDate || ""}
                onChange={(e) => onUpdate({ filedDate: e.target.value || undefined })}
                className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
              {remainingTime && stageProgress.status === "filed" && (
                <p className="text-[11px] text-blue-600 mt-2 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                  ⏱️ {Math.round(remainingTime.elapsed)} months elapsed • typical: {remainingTime.typical.min}-{remainingTime.typical.max} months
                </p>
              )}
            </div>
          )}

          {/* Approved date */}
          {stageProgress.status === "approved" && (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Approved Date</label>
              <input
                type="date"
                value={stageProgress.approvedDate || ""}
                onChange={(e) => onUpdate({ approvedDate: e.target.value || undefined })}
                className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>
          )}

          {/* Receipt number */}
          {(stageProgress.status === "filed" || stageProgress.status === "approved") && (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Receipt Number
                <span className="text-gray-400 font-normal ml-1 normal-case">(e.g., EAC2490012345)</span>
              </label>
              <input
                type="text"
                value={stageProgress.receiptNumber || ""}
                onChange={(e) => onUpdate({ receiptNumber: e.target.value || undefined })}
                placeholder="Enter receipt number"
                className="w-full px-4 py-2.5 text-sm font-mono border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>
          )}

          {/* Priority date (for I-140, PERM, etc.) */}
          {canHavePriorityDate && stageProgress.status === "approved" && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <label className="block text-[10px] font-bold text-amber-700 mb-2 uppercase tracking-wider flex items-center gap-1">
                <span>📅</span> Priority Date
                <span className="text-amber-600 font-normal ml-1 normal-case">(from approval notice)</span>
              </label>
              <input
                type="date"
                value={stageProgress.priorityDate || ""}
                onChange={(e) => onUpdate({ priorityDate: e.target.value || undefined })}
                className="w-full px-4 py-2.5 text-sm border-2 border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all bg-white"
              />
              <p className="text-[11px] text-amber-700 mt-2 leading-relaxed">
                This establishes when you entered the queue for a green card.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Notes</label>
            <textarea
              value={stageProgress.notes || ""}
              onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
              placeholder="Any additional notes..."
              rows={2}
              className="w-full px-4 py-2.5 text-sm border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none transition-all"
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
    for (const nodeId of PRIORITY_DATE_STAGES) {
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

  // Calculate estimated completion based on GREEN CARD date (not status track end)
  const estimatedCompletion = useMemo(() => {
    const now = new Date();
    
    // Find when the Green Card is obtained (GC marker position)
    // This is the END of the GC track, not the overall path max (which includes status track)
    const gcMarker = path.stages.find(s => s.nodeId === "gc");
    const gcEndYears = gcMarker?.startYear || path.totalYears?.max || 0;
    const gcEndMonths = gcEndYears * 12;
    
    // Calculate time already elapsed on GC track stages
    let completedMonths = 0;
    
    // Only count GC track stages (not status track like TN/H-1B)
    const gcStages = path.stages.filter(s => s.track === "gc" && s.nodeId !== "gc" && !s.isPriorityWait);
    
    for (const stage of gcStages) {
      const sp = progress.stages[stage.nodeId] || { status: "not_started" };
      const stageMaxMonths = (stage.durationYears?.max || 0) * 12;
      
      if (sp.status === "approved") {
        // Fully completed - but for concurrent stages, don't double count
        if (!stage.isConcurrent) {
          completedMonths += stageMaxMonths;
        }
      } else if (sp.status === "filed" && sp.filedDate) {
        // Partially completed - calculate elapsed time
        const filedDate = parseDate(sp.filedDate);
        if (filedDate) {
          const elapsedMonths = monthsBetween(filedDate, now);
          if (!stage.isConcurrent) {
            completedMonths += Math.min(elapsedMonths, stageMaxMonths);
          }
        }
      }
    }
    
    // Remaining = GC end time - completed GC stages
    const remainingMonths = Math.max(0, gcEndMonths - completedMonths);
    
    // Check for uncertainty (PD wait stages exist)
    const hasUncertainty = path.stages.some(s => s.isPriorityWait);

    // Calculate estimated date
    const estimatedDate = new Date(now);
    estimatedDate.setMonth(estimatedDate.getMonth() + Math.round(remainingMonths));

    return {
      date: estimatedDate,
      months: remainingMonths,
      hasUncertainty,
    };
  }, [path.totalYears, path.stages, progress.stages]);

  // Priority date aging benefit
  const pdAgingBenefit = useMemo(() => {
    if (!effectivePD?.date) return null;
    
    // Find how long until we need the PD (I-485 filing stage)
    let monthsUntilI485 = 0;
    const now = new Date();
    
    for (const stage of trackableStages) {
      if (stage.nodeId === "i485") break;
      
      const sp = progress.stages[stage.nodeId] || { status: "not_started" };
      const typical = TYPICAL_PROCESSING_MONTHS[stage.nodeId];
      
      if (sp.status === "approved") continue;
      
      if (sp.status === "filed" && sp.filedDate) {
        const filedDate = parseDate(sp.filedDate);
        if (filedDate && typical) {
          const elapsed = monthsBetween(filedDate, now);
          monthsUntilI485 += Math.max(0, (typical.min + typical.max) / 2 - elapsed);
        }
      } else if (typical) {
        monthsUntilI485 += (typical.min + typical.max) / 2;
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
      <div className="fixed inset-y-0 right-0 w-full max-w-[420px] bg-white border-l border-gray-100 flex flex-col overflow-hidden z-50 lg:relative lg:w-[400px] lg:z-auto shadow-2xl lg:shadow-lg animate-slide-in-right">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-white to-gray-50 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-brand-600 bg-brand-50 px-2 py-1 rounded-full font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
              TRACKING
            </span>
          </div>
          <h2 className="font-bold text-gray-900 text-lg mt-1">{path.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all duration-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Estimated Completion */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-brand-50 via-green-50 to-emerald-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-brand-600 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎯</span> Estimated Green Card
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {estimatedCompletion.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </div>
          </div>
          <div className="text-right bg-white/60 backdrop-blur-sm rounded-xl px-4 py-2 shadow-sm">
            <div className="text-[10px] text-gray-500 font-medium">Time Remaining</div>
            <div className="text-lg font-bold text-brand-700">
              {formatMonthsRemaining(estimatedCompletion.months)}
            </div>
          </div>
        </div>
        {estimatedCompletion.hasUncertainty && (
          <p className="text-[10px] text-amber-700 mt-2 bg-amber-50 px-2 py-1 rounded-lg inline-flex items-center gap-1">
            <span>⚠️</span> Estimate includes uncertain factors like visa bulletin wait
          </p>
        )}
      </div>

      {/* Priority Date Section */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/70 to-orange-50/50 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>📅</span> Priority Date
          </h3>
          {effectivePD && (
            <span className="text-sm text-amber-800 font-bold bg-white/60 px-2 py-0.5 rounded-lg">
              {formatDateDisplay(effectivePD.date)}
            </span>
          )}
        </div>
        
        {effectivePD ? (
          <>
            <div className="text-xs text-gray-600">
              <span className="text-amber-800 font-semibold">{effectivePD.source}</span>
              <span className="text-gray-500 ml-1.5">• {timeElapsed(effectivePD.date)}</span>
            </div>
            
            {/* PD Aging Benefit */}
            {pdAgingBenefit && (
              <div className="mt-3 p-3 bg-gradient-to-r from-green-100 to-emerald-50 border border-green-200 rounded-xl text-xs shadow-sm">
                <div className="font-bold text-green-800 flex items-center gap-1.5">
                  <span>📈</span> PD Aging Benefit
                </div>
                <div className="text-green-700 mt-1 leading-relaxed">
                  Your PD will be <strong>{pdAgingBenefit.futureAge} months old</strong> by the time you file I-485
                  <span className="text-green-600 font-medium ml-1">(+{pdAgingBenefit.monthsGained} months closer!)</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500 bg-white/50 rounded-lg px-3 py-2">
            No priority date yet. Established when I-140 is approved.
          </p>
        )}

        {/* Ported PD input */}
        <details className="mt-3">
          <summary className="text-xs text-brand-600 cursor-pointer hover:text-brand-700 font-medium flex items-center gap-1">
            <span>⚡</span>
            {progress.portedPriorityDate ? "Edit ported PD" : "Have a PD from a previous employer?"}
          </summary>
          <div className="mt-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
            <p className="text-[11px] text-gray-600 leading-relaxed">
              If you have an approved I-140 from a <strong>previous employer</strong>, you can port that priority date to your new case.
            </p>
            <div>
              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase tracking-wide">Priority Date</label>
              <input
                type="date"
                value={progress.portedPriorityDate || ""}
                onChange={(e) => onUpdatePortedPD(e.target.value || null, progress.portedPriorityDateCategory || null)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-600 mb-1 uppercase tracking-wide">Category</label>
              <select
                value={progress.portedPriorityDateCategory || ""}
                onChange={(e) => onUpdatePortedPD(progress.portedPriorityDate || null, e.target.value || null)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
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
                className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1 mt-1"
              >
                <span>×</span> Remove ported PD
              </button>
            )}
          </div>
        </details>
      </div>

      {/* Summary bar */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
        <div className="flex items-center justify-around text-xs">
          <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-sm" />
            <span className="text-green-700 font-semibold">{stageSummary.approved} done</span>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm" />
            <span className="text-blue-700 font-semibold">{stageSummary.filed} pending</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-full">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400" />
            <span className="text-gray-600 font-semibold">{stageSummary.notStarted} to go</span>
          </div>
        </div>
      </div>

      {/* Stage list */}
      <div className="flex-1 overflow-y-auto min-h-0" ref={scrollContainerRef}>
        {trackableStages.map((stage, index) => {
          const stageProgress = progress.stages[stage.nodeId] || { status: "not_started" };
          const isCurrentStage = index === currentStageIndex;
          
          return (
            <StageItem
              key={stage.nodeId}
              stage={stage}
              stageProgress={stageProgress}
              onUpdate={(update) => onUpdateStage(stage.nodeId, update)}
              isExpanded={expandedStageId === stage.nodeId}
              onToggleExpand={() => onExpandStage(
                expandedStageId === stage.nodeId ? null : stage.nodeId
              )}
              stageRef={{ current: null } as React.RefObject<HTMLDivElement>}
              isCurrentStage={isCurrentStage}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
        <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
          <span className="text-brand-500">💡</span>
          <span>Click stages in timeline to edit • Dates update your estimate</span>
        </p>
      </div>
    </div>
    </>
  );
}
