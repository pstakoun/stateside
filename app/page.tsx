"use client";

import { useState, useCallback } from "react";
import TimelineChart from "@/components/TimelineChart";
import PathDetail from "@/components/PathDetail";
import FilterPanel from "@/components/FilterPanel";
import { FilterState, defaultFilters } from "@/lib/filter-paths";

export default function Home() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [matchingCount, setMatchingCount] = useState(0);

  const handleMatchingCountChange = useCallback((count: number) => {
    setMatchingCount(count);
  }, []);

  return (
    <main className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">
            US Immigration Pathways
          </h1>
          <p className="text-gray-500">
            Interactive timeline to US Green Card. Select your situation to see relevant paths.
          </p>
        </div>
      </header>

      {/* Filter Panel */}
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        matchingCount={matchingCount}
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

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto text-xs text-gray-500 text-center">
          Data from USCIS FY2023. Timelines are estimates. Always consult an immigration attorney.
        </div>
      </footer>
    </main>
  );
}
