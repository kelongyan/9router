import { NextResponse } from "next/server";
import { getHeatmapData } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getHeatmapData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API] Failed to get heatmap data:", error);
    return NextResponse.json({ error: "Failed to fetch heatmap data" }, { status: 500 });
  }
}
