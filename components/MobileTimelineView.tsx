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
  isStatusVisa,
  PRIORITY_DATE_STAGES,
} from "@/lib/constants";

interface MobileTimelineViewProps {
  onStageClick: (nodeId: string) => void;
  filters: FilterState;
  onMatchingCountChange: (count: number) => void;
  onSelectPath?: (path: ComposedPath) => void;
  onPathsGenerated?: (paths: ComposedPath[]) => void;
  selectedPathId?: string | null;
  globalProgress?: GlobalProgress | null;
  // Stage editing props
  onUpdateStage?: (nodeId: string, update: Partial<StageProgress>) => void;
  onUpdatePortedPD?: (date: string | null, category: string | null) => void;
  expandedStageId?: string | null;
  onExpandStage?: (nodeId: string | null) => void;
}

const categoryColors: Record<string, { bg: string; border: string; text: string; light: string; hex: string }> = {
  entry: { bg: "bg-brand-600", border: "border-brand-700", text: "text-white", light: "bg-brand-50", hex: "#16a34a" },
  work: { bg: "bg-emerald-500", border: "border-emerald-600", text: "text-white", light: "bg-emerald-50", hex: "#10b981" },
  greencard: { bg: "bg-amber-500", border: "border-amber-600", text: "text-white", light: "bg-amber-50", hex: "#f59e0b" },
  citizenship: { bg: "bg-purple-500", border: "border-purple-600", text: "text-white", light: "bg-purple-50", hex: "#a855f7" },
};

// Colors for mini timeline (using hex for inline styles)
const miniTimelineColors = {
  status: "#10b981", // emerald-500
  gc: "#f59e0b", // amber-500
  pdWait: "#f97316", // orange-500
  gcMarker: "#22c55e", // green-500
  approved: "#22c55e", // green-500
  filed: "#3b82f6", // blue-500
};

// Parse date string helper
function parseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
  } catch {
    return null;
  }
}

// Mini Timeline Component - compact visual preview of the path
function MiniTimeline({ 
  stages, 
  globalProgress,
  totalYears,
}: { 
  stages: ComposedStage[];
  globalProgress: GlobalProgress | null | undefined;
  totalYears: number;
}) {
  // Calculate timeline bounds - use a reasonable scale
  const maxYears = Math.max(totalYears * 1.1, 6); // Add 10% padding, min 6 years
  
  // Separate stages by track
  const statusStages = stages.filter(s => s.track === "status" && !s.isPriorityWait && s.nodeId !== "gc");
  const gcStages = stages.filter(s => (s.track === "gc" || s.isPriorityWait) && s.nodeId !== "gc");
  const hasMultipleTracks = statusStages.length > 0 && gcStages.length > 0;
  
  // Calculate "now" position based on GC TRACK progress only
  // Status visas (TN, H-1B, etc.) run in parallel and don't move the "now" marker
  const nowPosition = useMemo(() => {
    if (!globalProgress) return null;
    
    const now = new Date();
    let furthestGcPosition = 0;
    let hasGcProgress = false;
    
    // Status visa nodes - these DON'T move the "now" marker when approved
    // because they run on a parallel track (you can have approved TN while working on PERM)
    const statusVisaNodes = new Set(['tn', 'h1b', 'opt', 'f1', 'l1a', 'l1b', 'o1']);
    
    for (const stage of stages) {
      if (stage.isPriorityWait || stage.nodeId === "gc") continue;
      
      // Skip status visas - they don't affect "now" position
      if (statusVisaNodes.has(stage.nodeId)) continue;
      
      // Only consider GC track stages
      if (stage.track !== "gc") continue;
      
      const sp = globalProgress.stages[stage.nodeId];
      if (!sp) continue;
      
      const stageStart = stage.startYear;
      const stageDuration = stage.durationYears?.max || 0.5;
      const stageEnd = stageStart + stageDuration;
      
      if (sp.status === "approved") {
        // GC step completed - we're past this stage's end
        hasGcProgress = true;
        furthestGcPosition = Math.max(furthestGcPosition, stageEnd);
      } else if (sp.status === "filed" && sp.filedDate) {
        // GC step in progress - calculate how far through based on filed date
        hasGcProgress = true;
        const filedDate = parseDate(sp.filedDate);
        if (filedDate) {
          const monthsElapsed = (now.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          const stageMonths = stageDuration * 12;
          const progressRatio = Math.min(monthsElapsed / stageMonths, 0.95); // Cap at 95% within stage
          const positionInStage = stageStart + (stageDuration * progressRatio);
          furthestGcPosition = Math.max(furthestGcPosition, positionInStage);
        }
      }
    }
    
    if (!hasGcProgress) return null;
    
    // Convert to percentage of the timeline
    const percent = (furthestGcPosition / maxYears) * 100;
    
    // Don't show if basically at the start
    if (percent < 2) return null;
    return Math.min(percent, 95);
  }, [stages, globalProgress, maxYears]);
  
  // Render a single track of stages
  const renderTrack = (trackStages: ComposedStage[], trackColor: string) => {
    return (
      <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
        {trackStages.map((stage, idx) => {
          const node = getNode(stage.nodeId);
          const startPercent = Math.max(0, (stage.startYear / maxYears) * 100);
          const durationYears = stage.durationYears?.max || 0.5;
          // Leave small gap between segments (0.5% gap)
          const widthPercent = Math.max(
            Math.min((durationYears / maxYears) * 100 - 0.5, 100 - startPercent - 0.5),
            1.5
          );
          
          // Get progress status
          const sp = globalProgress?.stages[stage.nodeId];
          const isApproved = sp?.status === "approved";
          const isFiled = sp?.status === "filed";
          
          // Determine color based on status and stage type
          let color = trackColor;
          let opacity = 1;
          
          if (stage.isPriorityWait) {
            color = miniTimelineColors.pdWait;
            if (isApproved) opacity = 0.5;
          } else if (isApproved) {
            color = miniTimelineColors.approved;
            opacity = 0.85;
          } else if (isFiled) {
            color = miniTimelineColors.filed;
          } else if (node?.category) {
            color = categoryColors[node.category]?.hex || trackColor;
          }
          
          return (
            <div
              key={`${stage.nodeId}-${idx}`}
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent}%`,
                backgroundColor: color,
                opacity,
              }}
            />
          );
        })}
      </div>
    );
  };
  
  // Find the GC marker position
  const gcMarkerStage = stages.find(s => s.nodeId === "gc");
  const gcMarkerPercent = gcMarkerStage 
    ? Math.min((gcMarkerStage.startYear / maxYears) * 100, 96)
    : null;
  
  return (
    <div className="mt-3 relative">
      {/* "Now" marker - small triangle above tracks */}
      {nowPosition !== null && (
        <div className="h-2 mb-0.5 relative">
          <div 
            className="absolute bottom-0"
            style={{ left: `${nowPosition}%`, transform: 'translateX(-50%)' }}
          >
            <div 
              className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-brand-500"
            />
          </div>
        </div>
      )}
      
      {/* Timeline tracks */}
      <div className="space-y-1">
        {/* Status track (if exists) */}
        {statusStages.length > 0 && renderTrack(statusStages, miniTimelineColors.status)}
        
        {/* GC track */}
        {gcStages.length > 0 && renderTrack(gcStages, miniTimelineColors.gc)}
      </div>
      
      {/* Green Card finish marker - at the end */}
      {gcMarkerPercent !== null && gcMarkerPercent > 50 && (
        <div 
          className="absolute flex items-center pointer-events-none z-10"
          style={{ 
            left: `${gcMarkerPercent}%`,
            top: hasMultipleTracks ? '50%' : '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white shadow-sm flex items-center justify-center">
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>
      )}
      
      {/* Year scale */}
      <div className="flex justify-between mt-1.5 text-[9px] text-gray-400">
        <span>Start</span>
        <span>{Math.ceil(totalYears)} yr</span>
      </div>
    </div>
  );
}

// Format date for display
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

// Get node info from visa data
function getNode(nodeId: string) {
  return visaData.nodes[nodeId as keyof typeof visaData.nodes];
}

// Mobile Path Card Component
function MobilePathCard({
  path,
  isTracked,
  isExpanded,
  onToggleExpand,
  onSelectPath,
  onStageClick,
  globalProgress,
  onUpdatePortedPD,
}: {
  path: ComposedPath;
  isTracked: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectPath: () => void;
  onStageClick: (nodeId: string) => void;
  globalProgress: GlobalProgress | null | undefined;
  onUpdatePortedPD?: (date: string | null, category: string | null) => void;
}) {
  // Calculate progress
  const progressInfo = useMemo(() => {
    if (!globalProgress) return { approved: 0, filed: 0, total: 0 };
    
    let approved = 0;
    let filed = 0;
    let total = 0;
    
    for (const stage of path.stages) {
      if (stage.isPriorityWait || stage.nodeId === "gc") continue;
      total++;
      const sp = globalProgress.stages[stage.nodeId];
      if (sp?.status === "approved") approved++;
      else if (sp?.status === "filed") filed++;
    }
    
    return { approved, filed, total };
  }, [path.stages, globalProgress]);

  const progressPercent = progressInfo.total > 0 
    ? ((progressInfo.approved + progressInfo.filed * 0.5) / progressInfo.total) * 100 
    : 0;

  // Calculate estimated remaining time for tracked paths
  // Uses same logic as desktop TrackerPanel for consistency
  const remainingEstimate = useMemo(() => {
    if (!globalProgress) return null;
    
    const now = new Date();
    
    // Helper to calculate months between dates
    const monthsBetween = (date1: Date, date2: Date): number => {
      return (date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24 * 30);
    };
    
    // Only count GC track stages (not status track like TN/H-1B)
    const gcStages = path.stages.filter(s => s.track === "gc" && s.nodeId !== "gc" && !s.isPriorityWait);
    
    // Check if there's any progress on GC track stages
    const hasGcProgress = gcStages.some(s => {
      const sp = globalProgress.stages[s.nodeId];
      return sp && (sp.status === "filed" || sp.status === "approved");
    });
    
    // Find earliest GC stage startYear from path composition
    // This is when the GC process can BEGIN (e.g., year 2 for Student → NIW)
    const earliestGcStartYear = gcStages.length > 0 
      ? Math.min(...gcStages.map(s => s.startYear || 0))
      : 0;
    
    // Track time like path-composer does:
    // KEY: If there's NO progress on GC track, use the original startYear
    let gcSequentialMonths = hasGcProgress ? 0 : earliestGcStartYear * 12;
    let gcMaxEndMonths = hasGcProgress ? 0 : earliestGcStartYear * 12;
    let prevStageStartMonths = hasGcProgress ? 0 : earliestGcStartYear * 12;
    
    for (let i = 0; i < gcStages.length; i++) {
      const stage = gcStages[i];
      const sp = globalProgress.stages[stage.nodeId] || { status: "not_started" };
      const stageMaxMonths = (stage.durationYears?.max || 0) * 12;
      
      let stageRemainingMonths = 0;
      
      if (sp.status === "approved") {
        stageRemainingMonths = 0;
      } else if (sp.status === "filed" && sp.filedDate) {
        const filedDate = parseDate(sp.filedDate);
        if (filedDate) {
          const elapsedMonths = monthsBetween(filedDate, now);
          stageRemainingMonths = Math.max(0, stageMaxMonths - elapsedMonths);
        }
      } else {
        stageRemainingMonths = stageMaxMonths;
      }
      
      // Concurrent stages start at the SAME time as the previous stage
      const stageStartMonths = stage.isConcurrent 
        ? prevStageStartMonths 
        : gcSequentialMonths;
      
      const stageEndMonths = stageStartMonths + stageRemainingMonths;
      
      prevStageStartMonths = stageStartMonths;
      gcSequentialMonths = Math.max(gcSequentialMonths, stageEndMonths);
      gcMaxEndMonths = Math.max(gcMaxEndMonths, stageEndMonths);
    }
    
    let remainingMonths = gcMaxEndMonths;
    
    // Add PD wait time if exists
    const pdWaitStage = path.stages.find(s => s.isPriorityWait);
    if (pdWaitStage) {
      remainingMonths += (pdWaitStage.durationYears?.max || 0) * 12;
    }
    
    if (remainingMonths < 12) {
      return `~${Math.round(remainingMonths)} mo`;
    } else {
      const years = remainingMonths / 12;
      return `~${years.toFixed(1)} yr`;
    }
  }, [path.stages, globalProgress]);

  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
        isTracked ? "border-brand-500 ring-2 ring-brand-200" : "border-gray-200"
      }`}
    >
      {/* Card Header - Always Visible */}
      <div 
        className="p-4 cursor-pointer active:bg-gray-50"
        onClick={onToggleExpand}
      >
        {/* Tracking indicator with time remaining */}
        {isTracked && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-brand-600 font-medium">
              <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
              Tracking
            </div>
            {remainingEstimate && (
              <div className="text-sm font-semibold text-brand-700">
                {remainingEstimate} remaining
              </div>
            )}
          </div>
        )}
        
        {/* Path name and badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 leading-tight">
              {path.name}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                {path.gcCategory}
              </span>
              {path.hasLottery && (
                <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  lottery
                </span>
              )}
              {path.isSelfPetition && (
                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                  self-file
                </span>
              )}
            </div>
          </div>
          
          {/* Expand icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        
        {/* Key metrics */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="font-medium text-gray-900">{path.totalYears.display}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <span className="text-gray-600">${path.estimatedCost.toLocaleString()}</span>
          </div>
        </div>
        
        {/* Mini Timeline Preview */}
        <MiniTimeline 
          stages={path.stages} 
          globalProgress={globalProgress}
          totalYears={path.totalYears.max}
        />
        
        {/* Progress bar (only show if tracking or has progress) */}
        {(isTracked || progressInfo.approved > 0 || progressInfo.filed > 0) && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{progressInfo.approved}/{progressInfo.total} complete</span>
              {progressInfo.filed > 0 && (
                <span className="text-blue-600">{progressInfo.filed} pending</span>
              )}
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Expanded Content - Vertical Stage Timeline */}
      {isExpanded && (
        <div className="border-t border-gray-100">
          {/* Track button */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelectPath();
              }}
              className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors ${
                isTracked 
                  ? "bg-gray-200 text-gray-700" 
                  : "bg-brand-500 text-white active:bg-brand-600"
              }`}
            >
              {isTracked ? "Stop Tracking" : "Track This Path"}
            </button>
          </div>
          
          {/* Priority Date Section - only show for tracked paths */}
          {isTracked && (
            <MobilePriorityDateSection
              path={path}
              globalProgress={globalProgress}
              onUpdatePortedPD={onUpdatePortedPD}
            />
          )}
          
          {/* Stages */}
          <MobileStageList 
            stages={path.stages}
            globalProgress={globalProgress}
            onStageClick={onStageClick}
            isTracked={isTracked}
          />
        </div>
      )}
    </div>
  );
}

// Mobile Stage List with Vertical Timeline
function MobileStageList({
  stages,
  globalProgress,
  onStageClick,
  isTracked,
}: {
  stages: ComposedStage[];
  globalProgress: GlobalProgress | null | undefined;
  onStageClick: (nodeId: string) => void;
  isTracked: boolean;
}) {
  // Group stages by track for display
  const statusStages = stages.filter(s => s.track === "status" && !s.isPriorityWait);
  const gcStages = stages.filter(s => s.track === "gc" || s.isPriorityWait || s.nodeId === "gc");

  return (
    <div className="divide-y divide-gray-100">
      {/* Status track (if exists) */}
      {statusStages.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
            Work Status
          </div>
          <div className="space-y-1">
            {statusStages.map((stage, idx) => (
              <MobileStageItem 
                key={`${stage.nodeId}-${idx}`}
                stage={stage}
                globalProgress={globalProgress}
                onStageClick={onStageClick}
                isTracked={isTracked}
                isFirst={idx === 0}
                isLast={idx === statusStages.length - 1}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* GC track */}
      {gcStages.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            Green Card Process
          </div>
          <div className="space-y-1">
            {gcStages.map((stage, idx) => (
              <MobileStageItem 
                key={`${stage.nodeId}-${idx}`}
                stage={stage}
                globalProgress={globalProgress}
                onStageClick={onStageClick}
                isTracked={isTracked}
                isFirst={idx === 0}
                isLast={idx === gcStages.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Individual Stage Item for Mobile
function MobileStageItem({
  stage,
  globalProgress,
  onStageClick,
  isTracked,
  isFirst,
  isLast,
}: {
  stage: ComposedStage;
  globalProgress: GlobalProgress | null | undefined;
  onStageClick: (nodeId: string) => void;
  isTracked: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const node = getNode(stage.nodeId);
  const stageProgress = globalProgress?.stages[stage.nodeId];
  const isApproved = stageProgress?.status === "approved";
  const isFiled = stageProgress?.status === "filed";
  const hasProgress = isApproved || isFiled;
  
  // Special handling for PD wait stages
  if (stage.isPriorityWait) {
    return (
      <div 
        className="flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-lg cursor-pointer active:bg-orange-50"
        onClick={() => onStageClick(stage.nodeId)}
      >
        <div className="flex flex-col items-center">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
            isApproved ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
          }`}>
            {isApproved ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            )}
          </div>
          {!isLast && <div className="w-0.5 h-4 bg-gray-200 mt-1" />}
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          <div className={`font-medium text-sm ${isApproved ? "text-gray-400 line-through" : "text-orange-700"}`}>
            Priority Date Wait
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {isApproved 
              ? "✓ Date became current" 
              : `Est. ${stage.durationYears.display} wait`
            }
          </div>
          {stage.velocityInfo && !isApproved && (
            <div className="text-xs text-orange-600 mt-1">
              {stage.velocityInfo.explanation}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Final green card marker
  if (stage.nodeId === "gc") {
    return (
      <div className="flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-lg">
        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="font-semibold text-sm text-green-700">
            Green Card
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Permanent Resident status
          </div>
        </div>
      </div>
    );
  }
  
  if (!node) return null;
  
  const colors = categoryColors[node.category] || categoryColors.work;

  return (
    <div 
      className={`flex items-start gap-3 py-2.5 px-3 -mx-3 rounded-lg cursor-pointer transition-colors ${
        isTracked ? "active:bg-brand-50" : "active:bg-gray-50"
      }`}
      onClick={() => onStageClick(stage.nodeId)}
    >
      {/* Timeline node */}
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          isApproved 
            ? "bg-green-500 text-white" 
            : isFiled 
              ? "bg-blue-500 text-white" 
              : `${colors.light} ${colors.border} border`
        }`}>
          {isApproved ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : isFiled ? (
            <div className="w-2 h-2 bg-white rounded-full" />
          ) : (
            <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
          )}
        </div>
        {!isLast && <div className="w-0.5 h-4 bg-gray-200 mt-1" />}
      </div>
      
      {/* Stage content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className={`font-medium text-sm ${
            isApproved ? "text-gray-400 line-through" : "text-gray-900"
          }`}>
            {node.name}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
            isApproved 
              ? "bg-green-100 text-green-700" 
              : isFiled 
                ? "bg-blue-100 text-blue-700" 
                : "bg-gray-100 text-gray-600"
          }`}>
            {isApproved 
              ? "Done" 
              : isFiled 
                ? "Pending" 
                : stage.durationYears.display
            }
          </span>
        </div>
        
        {/* Progress details */}
        {hasProgress && (
          <div className="text-xs text-gray-500 mt-0.5">
            {isApproved && stageProgress?.approvedDate && (
              <span>Approved {formatDateShort(stageProgress.approvedDate)}</span>
            )}
            {isFiled && stageProgress?.filedDate && (
              <span>Filed {formatDateShort(stageProgress.filedDate)}</span>
            )}
            {stageProgress?.receiptNumber && (
              <span className="font-mono ml-2">{stageProgress.receiptNumber}</span>
            )}
          </div>
        )}
        
        {/* Concurrent indicator */}
        {stage.isConcurrent && !hasProgress && (
          <div className="text-xs text-gray-400 mt-0.5">
            ↳ Concurrent with previous step
          </div>
        )}
        
        {/* Tap to edit hint for tracked paths */}
        {isTracked && (
          <div className="text-xs text-brand-600 mt-1">
            Tap to {hasProgress ? "edit" : "log progress"} →
          </div>
        )}
      </div>
    </div>
  );
}

// Mobile Priority Date Section Component
function MobilePriorityDateSection({
  path,
  globalProgress,
  onUpdatePortedPD,
}: {
  path: ComposedPath;
  globalProgress: GlobalProgress | null | undefined;
  onUpdatePortedPD?: (date: string | null, category: string | null) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Find priority date from current path's approved I-140 or equivalent
  const currentPathPD = useMemo(() => {
    if (!globalProgress) return null;
    
    // Use centralized constant for consistency with TrackerPanel
    for (const nodeId of Array.from(PRIORITY_DATE_STAGES)) {
      const stageProgress = globalProgress.stages[nodeId];
      if (stageProgress?.status === "approved" && stageProgress.priorityDate) {
        const node = getNode(nodeId);
        return { date: stageProgress.priorityDate, source: node?.name || nodeId };
      }
    }
    return null;
  }, [globalProgress]);

  // Effective priority date (earlier of ported vs current)
  const effectivePD = useMemo(() => {
    const portedPD = globalProgress?.portedPriorityDate;
    
    if (portedPD && currentPathPD?.date) {
      return portedPD < currentPathPD.date 
        ? { date: portedPD, source: "Ported from previous case" }
        : currentPathPD;
    }
    if (portedPD) {
      return { date: portedPD, source: "Ported from previous case" };
    }
    return currentPathPD;
  }, [globalProgress?.portedPriorityDate, currentPathPD]);

  // Format date for display
  const formatDateDisplay = (dateStr?: string): string => {
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
  };

  // Calculate time elapsed since a date
  const timeElapsed = (dateStr?: string): string => {
    if (!dateStr) return "";
    try {
      const [year, month, day] = dateStr.split("-").map(Number);
      const date = new Date(year, month - 1, day);
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
    } catch {
      return "";
    }
  };

  // Calculate PD aging benefit
  const pdAgingBenefit = useMemo(() => {
    if (!effectivePD?.date || !globalProgress) return null;
    
    const now = new Date();
    const pdDate = parseDate(effectivePD.date);
    if (!pdDate) return null;
    
    // Calculate months until I-485 (when PD matters)
    let monthsUntilI485 = 0;
    const trackableStages = path.stages.filter(s => !s.isPriorityWait && s.nodeId !== "gc");
    
    for (const stage of trackableStages) {
      if (stage.nodeId === "i485") break;
      
      const sp = globalProgress.stages[stage.nodeId] || { status: "not_started" };
      const stageMaxMonths = (stage.durationYears?.max || 0) * 12;
      
      if (sp.status === "approved") continue;
      
      if (sp.status === "filed" && sp.filedDate) {
        const filedDate = parseDate(sp.filedDate);
        if (filedDate && stageMaxMonths > 0) {
          const elapsed = (now.getTime() - filedDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
          monthsUntilI485 += Math.max(0, stageMaxMonths - elapsed);
        }
      } else if (stageMaxMonths > 0) {
        monthsUntilI485 += stageMaxMonths;
      }
    }

    if (monthsUntilI485 < 6) return null; // Not significant

    const pdAgeNow = (now.getTime() - pdDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    const pdAgeAtI485 = pdAgeNow + monthsUntilI485;

    return {
      currentAge: Math.round(pdAgeNow),
      futureAge: Math.round(pdAgeAtI485),
      monthsGained: Math.round(monthsUntilI485),
    };
  }, [effectivePD, globalProgress, path.stages]);

  return (
    <div className="border-t border-gray-100 bg-amber-50/50">
      {/* Priority Date Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between active:bg-amber-100/50"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-sm font-medium text-gray-900">Priority Date</span>
        </div>
        <div className="flex items-center gap-2">
          {effectivePD ? (
            <span className="text-sm font-semibold text-amber-700">
              {formatDateDisplay(effectivePD.date)}
            </span>
          ) : (
            <span className="text-xs text-gray-500">Not set</span>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {effectivePD ? (
            <>
              <div className="text-sm text-gray-600">
                <span className="text-amber-800 font-medium">{effectivePD.source}</span>
                <span className="text-gray-500 ml-1">({timeElapsed(effectivePD.date)})</span>
              </div>
              
              {/* PD Aging Benefit */}
              {pdAgingBenefit && (
                <div className="p-3 bg-green-100 border border-green-200 rounded-lg text-sm">
                  <div className="font-medium text-green-800">PD Aging Benefit</div>
                  <div className="text-green-700 mt-0.5">
                    Your PD will be <strong>{pdAgingBenefit.futureAge} months old</strong> by the time you file I-485
                    (+{pdAgingBenefit.monthsGained} months closer to being current)
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">
              No priority date yet. Established when I-140 is approved.
            </p>
          )}

          {/* Ported PD Section */}
          <div className="pt-2 border-t border-amber-200/50">
            <div className="text-xs font-medium text-gray-700 mb-2">
              {globalProgress?.portedPriorityDate ? "Ported Priority Date" : "Have a PD from a previous employer?"}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              If you have an approved I-140 from a <strong>previous employer</strong>, you can port that priority date to your new case.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Priority Date</label>
                <input
                  type="date"
                  value={globalProgress?.portedPriorityDate || ""}
                  onChange={(e) => onUpdatePortedPD?.(
                    e.target.value || null, 
                    globalProgress?.portedPriorityDateCategory || null
                  )}
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Category</label>
                <select
                  value={globalProgress?.portedPriorityDateCategory || ""}
                  onChange={(e) => onUpdatePortedPD?.(
                    globalProgress?.portedPriorityDate || null, 
                    e.target.value || null
                  )}
                  className="w-full px-3 py-2.5 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                >
                  <option value="">Select category</option>
                  <option value="eb1">EB-1</option>
                  <option value="eb2">EB-2</option>
                  <option value="eb3">EB-3</option>
                </select>
              </div>
              
              {globalProgress?.portedPriorityDate && (
                <button
                  onClick={() => onUpdatePortedPD?.(null, null)}
                  className="text-sm text-red-600 font-medium active:text-red-700 py-1"
                >
                  Remove ported PD
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stage Editor Sheet Component (inline)
function StageEditorSheet({
  stage,
  stageProgress,
  onUpdate,
  onClose,
}: {
  stage: ComposedStage;
  stageProgress: StageProgress;
  onUpdate: (update: Partial<StageProgress>) => void;
  onClose: () => void;
}) {
  const node = getNode(stage.nodeId);
  const nodeName = node?.name || stage.nodeId;
  const canHavePriorityDate = ["perm", "i140", "i140_niw"].includes(stage.nodeId);
  const stageMaxMonths = (stage.durationYears?.max || 0) * 12;

  // Calculate remaining time for filed stages
  const remainingTime = useMemo(() => {
    if (stageProgress.status !== "filed" || !stageProgress.filedDate) return null;
    
    const filedDate = parseDate(stageProgress.filedDate);
    if (!filedDate) return null;
    
    const now = new Date();
    const diffMs = now.getTime() - filedDate.getTime();
    const monthsElapsed = diffMs / (1000 * 60 * 60 * 24 * 30);
    
    if (stageMaxMonths === 0) return null;
    const remaining = Math.max(0, stageMaxMonths - monthsElapsed);
    
    return { elapsed: monthsElapsed, remaining };
  }, [stageProgress.status, stageProgress.filedDate, stageMaxMonths]);

  const statusColors = {
    not_started: "bg-gray-100 text-gray-700 border-gray-300",
    filed: "bg-blue-100 text-blue-700 border-blue-300",
    approved: "bg-green-100 text-green-700 border-green-300",
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 bg-white rounded-t-2xl z-50 max-h-[85vh] overflow-y-auto shadow-xl animate-slide-up safe-bottom">
        {/* Drag handle */}
        <div className="sticky top-0 bg-white pt-3 pb-2 border-b border-gray-100 z-10">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto" />
        </div>
        
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg">{nodeName}</h3>
              {stage.durationYears && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Typical: {stage.durationYears.display}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 text-gray-400 active:text-gray-600"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Status buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {(["not_started", "filed", "approved"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => onUpdate({ status })}
                  className={`py-3 px-2 text-sm font-medium rounded-xl border-2 transition-all active:scale-95 ${
                    stageProgress.status === status
                      ? statusColors[status]
                      : "bg-white text-gray-500 border-gray-200"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Filed Date</label>
              <input
                type="date"
                value={stageProgress.filedDate || ""}
                onChange={(e) => onUpdate({ filedDate: e.target.value || undefined })}
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              {remainingTime && stageProgress.status === "filed" && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <span className="font-medium">{Math.round(remainingTime.elapsed)} months</span> elapsed
                    {remainingTime.remaining > 0 && (
                      <span className="text-blue-600"> · ~{Math.round(remainingTime.remaining)} mo remaining</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Approved date */}
          {stageProgress.status === "approved" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Approved Date</label>
              <input
                type="date"
                value={stageProgress.approvedDate || ""}
                onChange={(e) => onUpdate({ approvedDate: e.target.value || undefined })}
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          )}

          {/* Receipt number */}
          {(stageProgress.status === "filed" || stageProgress.status === "approved") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receipt Number
                <span className="text-gray-400 font-normal ml-1 text-xs">(optional)</span>
              </label>
              <input
                type="text"
                value={stageProgress.receiptNumber || ""}
                onChange={(e) => onUpdate({ receiptNumber: e.target.value || undefined })}
                placeholder="e.g., EAC2490012345"
                className="w-full px-4 py-3 text-base font-mono border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
          )}

          {/* Priority date for I-140, PERM */}
          {canHavePriorityDate && stageProgress.status === "approved" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority Date
                <span className="text-gray-400 font-normal ml-1 text-xs">(from approval)</span>
              </label>
              <input
                type="date"
                value={stageProgress.priorityDate || ""}
                onChange={(e) => onUpdate({ priorityDate: e.target.value || undefined })}
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Your place in the green card queue.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={stageProgress.notes || ""}
              onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
              placeholder="Any additional notes..."
              rows={2}
              className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
            />
          </div>
        </div>
        
        {/* Safe area */}
        <div className="h-6" />
      </div>
    </>
  );
}

// Main Mobile Timeline View Component
export default function MobileTimelineView({
  onStageClick,
  filters,
  onMatchingCountChange,
  onSelectPath,
  onPathsGenerated,
  selectedPathId,
  globalProgress,
  onUpdateStage,
  onUpdatePortedPD,
  expandedStageId,
  onExpandStage,
}: MobileTimelineViewProps) {
  const [expandedPathId, setExpandedPathId] = useState<string | null>(null);
  const [processingTimesLoaded, setProcessingTimesLoaded] = useState(false);
  const [priorityDates, setPriorityDates] = useState<DynamicData["priorityDates"]>(DEFAULT_PRIORITY_DATES);
  const [datesForFiling, setDatesForFiling] = useState<DynamicData["datesForFiling"]>(DEFAULT_DATES_FOR_FILING);

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
            setPriorityDates(result.data.priorityDates);
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

  // Generate paths
  const paths = useMemo(() => {
    const generatedPaths = generatePaths(filters, priorityDates, datesForFiling);
    onMatchingCountChange(generatedPaths.length);
    return generatedPaths;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, onMatchingCountChange, processingTimesLoaded, priorityDates, datesForFiling]);

  // Notify parent when paths are regenerated
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

  // Track analytics
  const lastTrackedFilters = useRef<string>("");
  useEffect(() => {
    if (paths.length > 0) {
      const filterHash = `${filters.education}-${filters.experience}-${filters.countryOfBirth}-${paths.length}`;
      if (filterHash !== lastTrackedFilters.current) {
        lastTrackedFilters.current = filterHash;
        trackPathsGenerated(paths.length, filters);
      }
    }
  }, [paths.length, filters]);

  // Auto-expand tracked path
  useEffect(() => {
    if (selectedPathId) {
      setExpandedPathId(selectedPathId);
    }
  }, [selectedPathId]);

  // Find the stage being edited
  const editingStage = useMemo(() => {
    if (!expandedStageId || !selectedPathId) return null;
    const trackedPath = paths.find(p => p.id === selectedPathId);
    if (!trackedPath) return null;
    return trackedPath.stages.find(s => s.nodeId === expandedStageId) || null;
  }, [expandedStageId, selectedPathId, paths]);

  const editingStageProgress = useMemo(() => {
    if (!expandedStageId || !globalProgress) return { status: "not_started" as const };
    return globalProgress.stages[expandedStageId] || { status: "not_started" as const };
  }, [expandedStageId, globalProgress]);

  const handleStageClick = useCallback((nodeId: string, path: ComposedPath) => {
    const node = getNode(nodeId);
    const nodeName = node?.name || nodeId;
    trackStageClick(nodeId, nodeName);
    
    // If this path isn't currently tracked, start tracking it first
    if (selectedPathId !== path.id && onSelectPath) {
      onSelectPath(path);
    }
    
    // Open the stage editor directly
    if (onExpandStage) {
      onExpandStage(nodeId);
    }
    
    onStageClick(nodeId);
  }, [onStageClick, selectedPathId, onSelectPath, onExpandStage]);

  const handleSelectPath = useCallback((path: ComposedPath) => {
    if (onSelectPath) {
      onSelectPath(path);
    }
  }, [onSelectPath]);

  const handleToggleExpand = useCallback((pathId: string) => {
    setExpandedPathId(current => current === pathId ? null : pathId);
  }, []);

  const handleUpdateStage = useCallback((update: Partial<StageProgress>) => {
    if (expandedStageId && onUpdateStage) {
      onUpdateStage(expandedStageId, update);
    }
  }, [expandedStageId, onUpdateStage]);

  const handleCloseEditor = useCallback(() => {
    if (onExpandStage) {
      onExpandStage(null);
    }
  }, [onExpandStage]);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-3 pb-24">
        {/* Empty state */}
        {sortedPaths.length === 0 && (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No matching paths</h3>
            <p className="text-gray-500 mt-1 text-sm">
              Try adjusting your profile to see available paths.
            </p>
          </div>
        )}

        {/* Path Cards */}
        {sortedPaths.map((path) => (
          <MobilePathCard
            key={path.id}
            path={path}
            isTracked={selectedPathId === path.id}
            isExpanded={expandedPathId === path.id}
            onToggleExpand={() => handleToggleExpand(path.id)}
            onSelectPath={() => handleSelectPath(path)}
            onStageClick={(nodeId) => handleStageClick(nodeId, path)}
            globalProgress={globalProgress}
            onUpdatePortedPD={onUpdatePortedPD}
          />
        ))}

        {/* Legend */}
        {sortedPaths.length > 0 && (
          <div className="bg-white rounded-xl p-4 border border-gray-200 mt-6">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Legend
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500" />
                <span className="text-gray-600">Work Status</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500" />
                <span className="text-gray-600">GC Process</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500" />
                <span className="text-gray-600">Filed/Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-green-500" />
                <span className="text-gray-600">Approved</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              Live data from DOL, USCIS, and State Dept. Timelines are estimates.
            </p>
          </div>
        )}
      </div>
      
      {/* Stage Editor Sheet - only shows when editing a stage */}
      {editingStage && onUpdateStage && (
        <StageEditorSheet
          stage={editingStage}
          stageProgress={editingStageProgress}
          onUpdate={handleUpdateStage}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
}
