// API route for processing times
import { NextResponse } from "next/server";
import { getProcessingTimes, isDataStale, getCacheAgeHours } from "@/lib/cache-processing-times";

export const dynamic = "force-dynamic"; // Don't cache this route

// GET: Return cached processing times
export async function GET() {
  try {
    const times = await getProcessingTimes();
    const stale = isDataStale();
    const ageHours = getCacheAgeHours();

    return NextResponse.json({
      data: times,
      meta: {
        isStale: stale,
        cacheAgeHours: Math.round(ageHours * 10) / 10,
        lastUpdated: times.lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error in processing-times GET:", error);
    return NextResponse.json(
      { error: "Failed to fetch processing times" },
      { status: 500 }
    );
  }
}

// POST: Force refresh cache
export async function POST() {
  try {
    const times = await getProcessingTimes(true); // Force refresh

    return NextResponse.json({
      data: times,
      meta: {
        refreshed: true,
        lastUpdated: times.lastUpdated,
      },
    });
  } catch (error) {
    console.error("Error in processing-times POST:", error);
    return NextResponse.json(
      { error: "Failed to refresh processing times" },
      { status: 500 }
    );
  }
}
