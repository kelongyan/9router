import { NextResponse } from "next/server";
import { getCustomModels, addCustomModel, addCustomModels, deleteCustomModel, deleteCustomModelsByProvider } from "@/models";
import { CAPACITY_META } from "@/shared/constants/models";

export const dynamic = "force-dynamic";

// Whitelist capability keys to boolean values — ignore anything else
function sanitizeCaps(caps) {
  if (!caps || typeof caps !== "object") return null;
  const clean = {};
  for (const key of Object.keys(CAPACITY_META)) {
    if (typeof caps[key] === "boolean") clean[key] = caps[key];
  }
  return Object.keys(clean).length ? clean : null;
}

// GET /api/models/custom - List all custom models
export async function GET() {
  try {
    const models = await getCustomModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.log("Error fetching custom models:", error);
    return NextResponse.json({ error: "Failed to fetch custom models" }, { status: 500 });
  }
}

// POST /api/models/custom - Add custom model, or several at once
// body: { providerAlias, id, type?, name?, caps? }  |  { providerAlias, type?, ids: [...] }
export async function POST(request) {
  try {
    const { providerAlias, id, ids, type, name, caps } = await request.json();
    if (!providerAlias) {
      return NextResponse.json({ error: "providerAlias required" }, { status: 400 });
    }
    if (Array.isArray(ids)) {
      const count = await addCustomModels({ providerAlias, type: type || "llm", ids });
      return NextResponse.json({ success: true, count });
    }
    if (!id) {
      return NextResponse.json({ error: "providerAlias and id required" }, { status: 400 });
    }
    const cleanCaps = sanitizeCaps(caps);
    const added = await addCustomModel({ providerAlias, id, type: type || "llm", name, ...(cleanCaps ? { caps: cleanCaps } : {}) });
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.log("Error adding custom model:", error);
    return NextResponse.json({ error: "Failed to add custom model" }, { status: 500 });
  }
}

// DELETE /api/models/custom?providerAlias=xxx[&id=yyy][&type=zzz]
// Without `id`, removes every custom model of that provider (narrowed to `type` when given).
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerAlias = searchParams.get("providerAlias");
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "llm";
    if (!providerAlias) {
      return NextResponse.json({ error: "providerAlias required" }, { status: 400 });
    }
    if (!id) {
      const removed = await deleteCustomModelsByProvider({ providerAlias, type });
      return NextResponse.json({ success: true, removed });
    }
    await deleteCustomModel({ providerAlias, id, type });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.log("Error deleting custom model:", error);
    return NextResponse.json({ error: "Failed to delete custom model" }, { status: 500 });
  }
}
