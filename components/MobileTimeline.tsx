"use client";

import { useState, useMemo, useEffect } from "react";
import visaData from "@/data/visa-paths.json";
import { ComposedPath, ComposedStage } from "@/lib/path-composer";
import { GlobalProgress, StageProgress } from "@/app/page";
import { 
  STATUS_VISA_NODES, 
  STATUS_VISA_VALIDITY_MONTHS,
} from "@/lib/constants";

interface MobileTimelineProps {
  paths: ComposedPath[];
  onStageClick: (nodeId: string, path: ComposedPath) => void;
  onSelectPath: (path: ComposedPath) => void;
  selectedPathId: string | null;
  globalProgress: GlobalProgress | null;
}

const categoryColors: Record<string, { bg: string; border: string; text: string; light: string }> = {
  entry: { bg: "bg-brand-600", border: "border-brand-700", text: "text-white", light: "bg-brand-100" },
  work: { bg: "bg-emerald-500", border: "border-emerald-600", text: "text-white", light: "bg-emerald-100" },
  greencard: { bg: "bg-amber-500", border: "border-amber-600", text: "text-white", light: "bg-amber-100" },
  citizenship: { bg: "bg-purple-500", border: "border-purple-600", text: "text-white", light: "bg-purple-100" },
};

// Get node info from visa data
function getNode(nodeId: string) {
  return visaData.nodes[nodeId as keyof typeof visaData.nodes];
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

// Parse YYYY-MM-DD to Date
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (isNaN(year) || isNaN(month)) return null;
  return new Date(year, month - 1, day || 1);
}

// Calculate months between two dates
function monthsBetween(date1: Date, date2: Date): number {
  const months = (date2.getFullYear() - date1.getFullYear()) * 12 +
    (date2.getMonth() - date1.getMonth());
  return Math.max(0, months);
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

// Single Stage Item component for vertical timeline
function MobileStageItem({
  stage,
  stageProgress,
  isLast,
  isCurrentStage,
  isTrackedPath,
  onClick,
}: {
  stage: ComposedStage;
  stageProgress: StageProgress | null;
  isLast: boolean;
  isCurrentStage: boolean;
  isTrackedPath: boolean;
  onClick: () => void;
}) {
  const node = getNode(stage.nodeId);
  if (!node && !stage.isPriorityWait && stage.nodeId !== "gc") return null;

  const isApproved = stageProgress?.status === "approved";
  const isFiled = stageProgress?.status === "filed";
  const hasProgress = isApproved || isFiled;
  const isStatusVisa = STATUS_VISA_NODES.has(stage.nodeId);
  
  // Calculate progress for filed stages
  const durationMonths = (stage.durationYears?.max || 0.5) * 12;
  const progressPercent = isFiled && !isApproved 
    ? getFiledProgress(stageProgress?.filedDate, durationMonths)
    : 0;

  // Determine node styling
  let nodeBg = "bg-gray-300";
  let nodeRing = "";
  let nodeIcon = null;
  
  if (isApproved) {
    nodeBg = "bg-green-500";
    nodeIcon = (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  } else if (isFiled) {
    nodeBg = "bg-blue-500";
    nodeIcon = (
      <div className="w-2 h-2 bg-white rounded-full" />
    );
  } else if (isCurrentStage && isTrackedPath) {
    nodeBg = "bg-brand-500";
    nodeRing = "ring-2 ring-brand-300 ring-offset-2";
  }

  // Special rendering for PD Wait stages
  if (stage.isPriorityWait) {
    const waitYears = stage.durationYears.max || 0.5;
    let waitColor = "bg-orange-500";
    if (isApproved) {
      waitColor = "bg-gray-400";
    } else if (waitYears >= 10) {
      waitColor = "bg-red-600";
    } else if (waitYears >= 5) {
      waitColor = "bg-red-500";
    }

    return (
      <div className="flex items-start gap-3">
        {/* Timeline node and line */}
        <div className="flex flex-col items-center">
          <div className={`w-6 h-6 rounded-full ${isApproved ? "bg-green-500" : waitColor} flex items-center justify-center flex-shrink-0`}>
            {isApproved ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            )}
          </div>
          {!isLast && <div className="w-0.5 h-full min-h-[40px] bg-gray-200 my-1" />}
        </div>

        {/* Stage content */}
        <button
          onClick={onClick}
          className={`flex-1 min-w-0 p-3 rounded-lg border text-left transition-colors mb-2 ${
            isApproved 
              ? "bg-gray-50 border-gray-200" 
              : "bg-orange-50 border-orange-200 active:bg-orange-100"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className={`font-medium text-sm ${isApproved ? "text-gray-500 line-through" : "text-orange-800"}`}>
                Priority Date Wait
              </div>
              <div className={`text-xs ${isApproved ? "text-gray-400" : "text-orange-600"}`}>
                {stage.durationYears.display}
                {stage.priorityDateStr && (
                  <span className="ml-1">• Cutoff: {stage.priorityDateStr}</span>
                )}
              </div>
            </div>
            {!isApproved && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400 flex-shrink-0">
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
          </div>
          {stage.velocityInfo && !isApproved && (
            <div className="mt-2 text-[11px] text-orange-700 leading-snug">
              {stage.velocityInfo.explanation}
            </div>
          )}
        </button>
      </div>
    );
  }

  // Special rendering for final Green Card
  if (stage.nodeId === "gc") {
    return (
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full ${isApproved ? "bg-green-600" : "bg-green-500"} flex items-center justify-center flex-shrink-0 shadow-md`}>
            {isApproved ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0 py-1">
          <div className={`font-bold text-sm ${isApproved ? "text-green-700" : "text-green-600"}`}>
            {isApproved ? "✓ Green Card Obtained!" : "Green Card"}
          </div>
          <div className="text-xs text-gray-500">Permanent Resident</div>
        </div>
      </div>
    );
  }

  // Regular stage rendering
  const colors = categoryColors[node?.category || "work"];
  const nodeName = node?.name || stage.nodeId;
  
  return (
    <div className="flex items-start gap-3">
      {/* Timeline node and line */}
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full ${nodeBg} ${nodeRing} flex items-center justify-center flex-shrink-0`}>
          {nodeIcon}
        </div>
        {!isLast && <div className="w-0.5 h-full min-h-[40px] bg-gray-200 my-1" />}
      </div>

      {/* Stage content */}
      <button
        onClick={onClick}
        className={`flex-1 min-w-0 p-3 rounded-lg border text-left transition-colors mb-2 ${
          isApproved
            ? "bg-green-50 border-green-200"
            : isFiled
            ? "bg-blue-50 border-blue-200 active:bg-blue-100"
            : isCurrentStage && isTrackedPath
            ? "bg-brand-50 border-brand-300 ring-1 ring-brand-200"
            : "bg-gray-50 border-gray-200 active:bg-gray-100"
        }`}
      >
        {/* Current/Next indicator */}
        {isCurrentStage && isTrackedPath && !hasProgress && (
          <div className="mb-2 -mt-1 -mx-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-brand-500 text-white rounded">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              NEXT STEP
            </span>
          </div>
        )}
        
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors.bg}`} />
              <span className={`font-medium text-sm truncate ${isApproved ? "text-green-700" : isFiled ? "text-blue-700" : "text-gray-900"}`}>
                {nodeName}
              </span>
            </div>
            
            <div className="mt-1 text-xs text-gray-500 pl-4">
              {isApproved && stageProgress?.approvedDate ? (
                <span className="text-green-600">
                  ✓ Approved {formatDateShort(stageProgress.approvedDate)}
                  {isStatusVisa && (
                    <span className="text-gray-500 ml-1">
                      (valid {STATUS_VISA_VALIDITY_MONTHS[stage.nodeId] / 12}yr)
                    </span>
                  )}
                </span>
              ) : isFiled && stageProgress?.filedDate ? (
                <span className="text-blue-600">
                  Filed {formatDateShort(stageProgress.filedDate)} • {Math.round(progressPercent)}% elapsed
                </span>
              ) : (
                <span>{stage.durationYears.display}</span>
              )}
            </div>
            
            {stageProgress?.receiptNumber && (
              <div className="mt-0.5 text-[10px] font-mono text-gray-400 pl-4 truncate">
                {stageProgress.receiptNumber}
              </div>
            )}
          </div>
          
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>

        {/* Progress bar for filed stages */}
        {isFiled && !isApproved && progressPercent > 0 && (
          <div className="mt-2 h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Stage note */}
        {stage.note && !hasProgress && (
          <div className="mt-1.5 text-[11px] text-gray-400 pl-4 leading-snug">
            {stage.note}
          </div>
        )}
      </button>
    </div>
  );
}

// Path Card component - shows one immigration path
function PathCard({
  path,
  isSelected,
  isTracked,
  globalProgress,
  onSelect,
  onStageClick,
}: {
  path: ComposedPath;
  isSelected: boolean;
  isTracked: boolean;
  globalProgress: GlobalProgress | null;
  onSelect: () => void;
  onStageClick: (nodeId: string) => void;
}) {
  // Calculate progress summary
  const progressSummary = useMemo(() => {
    if (!globalProgress) return { total: 0, approved: 0, filed: 0 };
    
    let total = 0;
    let approved = 0;
    let filed = 0;
    
    for (const stage of path.stages) {
      if (stage.isPriorityWait || stage.nodeId === "gc") continue;
      total++;
      const sp = globalProgress.stages[stage.nodeId];
      if (sp?.status === "approved") approved++;
      else if (sp?.status === "filed") filed++;
    }
    
    return { total, approved, filed };
  }, [path.stages, globalProgress]);

  // Find current stage (first non-approved)
  const currentStageIndex = useMemo(() => {
    return path.stages.findIndex(s => {
      if (s.isPriorityWait || s.nodeId === "gc") return false;
      const sp = globalProgress?.stages[s.nodeId];
      return !sp || sp.status !== "approved";
    });
  }, [path.stages, globalProgress]);

  const hasAnyProgress = progressSummary.approved > 0 || progressSummary.filed > 0;

  return (
    <div 
      className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
        isTracked 
          ? "border-brand-500 shadow-lg shadow-brand-100" 
          : isSelected
          ? "border-brand-300"
          : "border-gray-200"
      }`}
    >
      {/* Path Header - Always visible */}
      <button
        onClick={onSelect}
        className={`w-full p-4 text-left transition-colors ${
          isTracked ? "bg-brand-50" : "hover:bg-gray-50 active:bg-gray-100"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Tracking indicator */}
            {isTracked && (
              <div className="mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-semibold text-brand-700 uppercase tracking-wide">
                  Tracking
                </span>
              </div>
            )}
            
            <h3 className={`font-semibold text-base leading-tight ${isTracked ? "text-brand-900" : "text-gray-900"}`}>
              {path.name}
            </h3>
            
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <span className={`font-medium ${isTracked ? "text-brand-700" : "text-gray-700"}`}>
                {path.totalYears.display}
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-gray-500">${path.estimatedCost.toLocaleString()}</span>
              <span className="text-gray-300">•</span>
              <span className={`font-medium ${isTracked ? "text-brand-600" : "text-brand-600"}`}>
                {path.gcCategory}
              </span>
            </div>
            
            {/* Tags */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {path.hasLottery && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full">
                  lottery
                </span>
              )}
              {path.isSelfPetition && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded-full">
                  self-file
                </span>
              )}
            </div>
          </div>

          {/* Progress indicator or expand chevron */}
          <div className="flex flex-col items-end gap-2">
            {hasAnyProgress && (
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1">
                  {Array.from({ length: progressSummary.total }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2.5 h-2.5 rounded-full border border-white ${
                        i < progressSummary.approved
                          ? "bg-green-500"
                          : i < progressSummary.approved + progressSummary.filed
                          ? "bg-blue-500"
                          : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-gray-500">
                  {progressSummary.approved}/{progressSummary.total}
                </span>
              </div>
            )}
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              className={`text-gray-400 transition-transform ${isSelected ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded Stage List */}
      {isSelected && (
        <div className="border-t border-gray-100">
          {/* Track button if not tracked */}
          {!isTracked && (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <button
                onClick={onSelect}
                className="w-full py-2.5 px-4 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 active:bg-brand-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Track This Path
              </button>
              <p className="mt-2 text-[11px] text-gray-500 text-center">
                Track your progress and get personalized timeline updates
              </p>
            </div>
          )}

          {/* Stages vertical timeline */}
          <div className="p-4">
            {path.stages.map((stage, idx) => {
              const stageProgress = globalProgress?.stages[stage.nodeId] || null;
              const isLast = idx === path.stages.length - 1;
              const isCurrentStage = idx === currentStageIndex;
              
              return (
                <MobileStageItem
                  key={`${stage.nodeId}-${idx}`}
                  stage={stage}
                  stageProgress={stageProgress}
                  isLast={isLast}
                  isCurrentStage={isCurrentStage}
                  isTrackedPath={isTracked}
                  onClick={() => onStageClick(stage.nodeId)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MobileTimeline({
  paths,
  onStageClick,
  onSelectPath,
  selectedPathId,
  globalProgress,
}: MobileTimelineProps) {
  // Track which path card is expanded (can be different from tracked path)
  const [expandedPathId, setExpandedPathId] = useState<string | null>(selectedPathId);

  // Sort paths with tracked path at top
  const sortedPaths = useMemo(() => {
    if (!selectedPathId) return paths;
    return [...paths].sort((a, b) => {
      if (a.id === selectedPathId) return -1;
      if (b.id === selectedPathId) return 1;
      return 0;
    });
  }, [paths, selectedPathId]);

  // Auto-expand tracked path when it changes
  useEffect(() => {
    if (selectedPathId) {
      setExpandedPathId(selectedPathId);
    }
  }, [selectedPathId]);

  const handleSelectPath = (path: ComposedPath) => {
    // If clicking the currently expanded path
    if (expandedPathId === path.id) {
      // If it's not tracked, track it
      if (selectedPathId !== path.id) {
        onSelectPath(path);
      } else {
        // If it's already tracked, collapse it
        setExpandedPathId(null);
      }
    } else {
      // Expand the clicked path
      setExpandedPathId(path.id);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-100">
      <div className="p-4 space-y-4 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Immigration Paths
          </h2>
          <span className="text-sm text-gray-500">
            {paths.length} {paths.length === 1 ? "path" : "paths"}
          </span>
        </div>

        {/* Empty state */}
        {paths.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-200 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <circle cx="12" cy="12" r="10" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">No matching paths</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your profile to see available immigration paths.
            </p>
          </div>
        )}

        {/* Path cards */}
        {sortedPaths.map((path) => (
          <PathCard
            key={path.id}
            path={path}
            isSelected={expandedPathId === path.id}
            isTracked={selectedPathId === path.id}
            globalProgress={globalProgress}
            onSelect={() => handleSelectPath(path)}
            onStageClick={(nodeId) => onStageClick(nodeId, path)}
          />
        ))}

        {/* Legend */}
        {paths.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>Work Status</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span>GC Process</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Filed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Approved</span>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-gray-400 text-center leading-relaxed">
              Live data from DOL, USCIS, and State Dept. Timelines are estimates. 
              Consult an immigration attorney for your situation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
