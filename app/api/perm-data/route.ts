// API route for PERM velocity and statistics data
// Provides PERM certification rates and velocity calculations for wait time estimates
import { NextResponse } from "next/server";
import { 
  getPERMStatistics, 
  calculateVelocity, 
  getVisaAllocation,
  estimateAnnualDemand,
  AVG_DEPENDENTS,
  COUNTRY_DISTRIBUTION,
} from "@/lib/perm-velocity";

export const dynamic = "force-dynamic"; // Don't cache this route

// GET: Return PERM statistics and velocity data
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as "eb1" | "eb2" | "eb3" | null;
    const country = searchParams.get("country") as "india" | "china" | "other" | null;

    const statistics = getPERMStatistics();
    
    // Calculate velocity for all or specific category/country
    const velocityData: Record<string, Record<string, ReturnType<typeof calculateVelocity>>> = {};
    
    const categories: Array<"eb1" | "eb2" | "eb3"> = category ? [category] : ["eb1", "eb2", "eb3"];
    const countries: Array<"india" | "china" | "other"> = country ? [country] : ["india", "china", "other"];
    
    for (const cat of categories) {
      velocityData[cat] = {};
      for (const ctry of countries) {
        velocityData[cat][ctry] = calculateVelocity(cat, ctry);
      }
    }

    // Get visa allocation details
    const allocations: Record<string, ReturnType<typeof getVisaAllocation>> = {};
    for (const cat of categories) {
      allocations[cat] = getVisaAllocation(cat);
    }

    // Get demand estimates
    const demandEstimates: Record<string, Record<string, number>> = {};
    for (const cat of categories) {
      demandEstimates[cat] = {};
      for (const ctry of countries) {
        demandEstimates[cat][ctry] = estimateAnnualDemand(cat, ctry);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        statistics,
        velocityByCategory: velocityData,
        visaAllocations: allocations,
        demandEstimates,
        assumptions: {
          averageDependents: AVG_DEPENDENTS,
          countryDistribution: COUNTRY_DISTRIBUTION,
        },
      },
      meta: {
        description: "PERM-based velocity data for employment-based green card wait time estimates",
        sources: [
          "DOL PERM Disclosure Data (dol.gov/agencies/eta/foreign-labor/performance)",
          "USCIS H-1B Employer Data Hub",
          "Statutory visa allocation limits",
        ],
        formula: "velocity = (annual_perm_certs × avg_dependents × country_share × category_share) / visa_availability",
        note: "Wait estimates use this velocity to predict visa bulletin movement rates",
      },
    });
  } catch (error) {
    console.error("Error fetching PERM data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch PERM data" },
      { status: 500 }
    );
  }
}
