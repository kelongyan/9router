import { NextResponse } from "next/server";
import { getFreeModelsSnapshot } from "./service";

/**
 * GET /api/free-models
 * Dashboard snapshot: free-model candidates per provider merged with the latest
 * probe results (status ok / fail / needs-auth / unprobed). Candidates refresh
 * from live feeds on a 10-minute cache; probe state follows the last round.
 */
export async function GET() {
  try {
    const snapshot = await getFreeModelsSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.log("Error building free-models snapshot:", error);
    return NextResponse.json({ error: "Failed to load free models" }, { status: 500 });
  }
}
