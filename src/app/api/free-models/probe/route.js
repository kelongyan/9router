import { NextResponse } from "next/server";
import { startProbe } from "../service";

/**
 * POST /api/free-models/probe
 * Body: { provider?: string } — omit to probe every provider, or pass a
 * provider id (e.g. "cline") to limit the round. Non-blocking: the round runs
 * in the background, the dashboard polls GET /api/free-models while
 * `probing` is true.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = startProbe(body.provider);
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error starting free-models probe:", error);
    return NextResponse.json({ error: "Failed to start probe" }, { status: 500 });
  }
}
