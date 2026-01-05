"use client";

import { useState, useMemo } from "react";
import visaData from "@/data/visa-paths.json";
import { FilterState, statusToNodeId } from "@/lib/filter-paths";
import { generatePaths, ComposedPath, ComposedStage } from "@/lib/path-composer";

const PIXELS_PER_YEAR = 160;
const MAX_YEARS = 8;
const TRACK_HEIGHT = 32;
const TRACK_GAP = 6;
const CONCURRENT_OFFSET = 36;

interface TimelineChartProps {
  onStageClick: (nodeId: string) => void;
  filters: FilterState;
  onMatchingCountChange: (count: number) => void;
}

const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  entry: { bg: "bg-blue-500", border: "border-blue-600", text: "text-white" },
  work: { bg: "bg-emerald-500", border: "border-emerald-600", text: "text-white" },
  greencard: { bg: "bg-amber-500", border: "border-amber-600", text: "text-white" },
  citizenship: { bg: "bg-purple-500", border: "border-purple-600", text: "text-white" },
};

const trackLabels: Record<string, string> = {
  status: "Status",
  gc: "GC Process",
};

export default function TimelineChart({
  onStageClick,
  filters,
  onMatchingCountChange,
}: TimelineChartProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const years = Array.from({ length: MAX_YEARS + 1 }, (_, i) => i);

  // Get current status node for "you are here" highlighting
  const currentNodeId = statusToNodeId[filters.currentStatus];

  // Generate paths dynamically using the composer
  const paths = useMemo(() => {
    const generatedPaths = generatePaths(filters);
    onMatchingCountChange(generatedPaths.length);
    return generatedPaths;
  }, [filters, onMatchingCountChange]);

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

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-auto bg-gray-50">
      <div className="min-w-[1200px] p-6">
        {/* Year markers */}
        <div className="flex mb-2" style={{ marginLeft: "220px" }}>
          {years.map((year) => (
            <div
              key={year}
              className="text-xs text-gray-500 font-medium"
              style={{ width: PIXELS_PER_YEAR, flexShrink: 0 }}
            >
              {year === 0 ? "Start" : `Year ${year}`}
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

          {/* Path lanes */}
          <div className="relative py-4">
            {paths.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                <p className="text-lg font-medium">No matching paths</p>
                <p className="text-sm mt-1">
                  Try adjusting your criteria to see available immigration paths.
                </p>
              </div>
            )}
            {paths.map((path) => {
              const isSelected = selectedPath === path.id;
              const isDimmed = selectedPath !== null && !isSelected;
              const multiTrack = hasMultipleTracks(path.stages);
              const hasConcurrent = hasConcurrentStages(path.stages);
              // Add extra height if we have concurrent stages that need offset
              const pathHeight = multiTrack
                ? TRACK_HEIGHT * 2 + TRACK_GAP + (hasConcurrent ? CONCURRENT_OFFSET : 0)
                : TRACK_HEIGHT;

              return (
                <div
                  key={path.id}
                  className={`relative transition-opacity duration-200 mb-6 ${
                    isDimmed ? "opacity-40" : "opacity-100"
                  }`}
                  style={{ height: pathHeight + 24 }}
                >
                  {/* Path header - positioned to the left */}
                  <div
                    className="absolute right-full mr-4 top-0 w-[200px] text-right cursor-pointer"
                    onClick={() =>
                      setSelectedPath(selectedPath === path.id ? null : path.id)
                    }
                  >
                    <div className="font-semibold text-gray-900 text-sm">
                      {path.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {path.totalYears.display}
                    </div>
                    <div className="text-[10px] text-blue-600 font-medium">
                      {path.gcCategory}
                    </div>
                    {multiTrack && (
                      <div className="mt-1 text-[10px] text-gray-400 space-y-0.5">
                        <div>{trackLabels.status}</div>
                        <div>{trackLabels.gc}</div>
                      </div>
                    )}
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

                  {/* Stages */}
                  {path.stages.map((stage, idx) => {
                    const node = getNode(stage.nodeId);
                    if (!node) return null;

                    const startYear = stage.startYear;
                    const duration = stage.durationYears.max || 0.5;
                    const track = stage.track;

                    const left = startYear * PIXELS_PER_YEAR;
                    // No minimum width - use actual duration
                    const naturalWidth = duration * PIXELS_PER_YEAR - 2;
                    const width = Math.max(naturalWidth, 24); // Just enough for a small marker
                    const isCompact = naturalWidth < 50; // Compact mode for small stages

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

                    return (
                      <div
                        key={`${stage.nodeId}-${idx}`}
                        className={`absolute rounded cursor-pointer transition-all duration-150 border
                          ${colors.bg} ${colors.border} ${colors.text}
                          ${isHovered ? "ring-2 ring-offset-1 ring-blue-400 scale-105 z-30" : "z-10"}
                          ${isCurrentStatus ? "ring-2 ring-offset-1 ring-red-500" : ""}
                          ${isFinalGC ? "bg-purple-500 border-purple-600" : ""}
                        `}
                        style={{
                          left: `${left}px`,
                          width: isFinalGC ? "40px" : `${width}px`,
                          height: TRACK_HEIGHT,
                          top: `${top}px`,
                        }}
                        onClick={() => onStageClick(stage.nodeId)}
                        onMouseEnter={() => setHoveredStage(`${path.id}-${idx}`)}
                        onMouseLeave={() => setHoveredStage(null)}
                      >
                        <div className="h-full px-1 flex flex-col justify-center overflow-hidden relative">
                          {isCurrentStatus && (
                            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap">
                              YOU ARE HERE
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
                                {stage.durationYears.display}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Tooltip on hover */}
                        {isHovered && (
                          <div className="absolute top-full left-0 mt-1 bg-gray-900 text-white text-xs px-2 py-1.5 rounded shadow-lg whitespace-nowrap z-40">
                            <div className="font-semibold">{node.name}</div>
                            <div className="text-gray-300">{stage.durationYears.display}</div>
                            {stage.note && <div className="text-gray-400 text-[10px] mt-0.5">{stage.note}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-6 justify-center">
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
            <span className="text-sm text-gray-600">Entry Visa</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-500" />
            <span className="text-sm text-gray-600">Green Card</span>
          </div>
        </div>

        {/* Note */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Paths generated based on your situation. Click any stage for details.
        </p>
      </div>
    </div>
  );
}
