// 模型白名单管理 API（本机定制）
//   GET    → { ids, available }   ids=已选白名单；available=全量可选模型（不受白名单影响）
//   PUT    → body { ids: [...] }  覆盖保存（空数组 = 清空 = 停止过滤）
//   DELETE → 清空
//
// 认证：/api/* 默认 deny-by-default，由 src/dashboardGuard.js 统一要求 dashboard 登录态。
import { NextResponse } from "next/server";
import { getModelWhitelist, setModelWhitelist } from "@/lib/modelWhitelistDb";
import { buildModelsList } from "@/app/api/v1/models/route.js";

export const dynamic = "force-dynamic";

// 管理页必须能看到「所有类型」的模型：白名单一旦启用，未列入的图片/语音/嵌入
// 模型同样会被过滤掉，所以挑选界面不能只列 LLM，否则用户无法把它们加回来。
const ALL_KINDS = [
  "llm",
  "image",
  "tts",
  "stt",
  "embedding",
  "imageToText",
  "webSearch",
  "webFetch",
];

// GET /api/models/whitelist
export async function GET() {
  try {
    const ids = await getModelWhitelist();

    let available = [];
    try {
      // skipWhitelist：管理页要拿「全量」，否则白名单生效后就再也看不到未选中的模型了。
      const all = await buildModelsList(ALL_KINDS, { skipWhitelist: true });
      available = all.map((m) => ({ id: m.id, owned_by: m.owned_by || "" }));
    } catch (e) {
      console.log("Could not build full model list for whitelist UI:", e?.message || e);
    }

    return NextResponse.json({ ids, available });
  } catch (error) {
    console.log("Error fetching model whitelist:", error);
    return NextResponse.json({ error: "Failed to fetch model whitelist" }, { status: 500 });
  }
}

// PUT /api/models/whitelist  body: { ids: string[] }
export async function PUT(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body?.ids)) {
      return NextResponse.json({ error: "ids[] required" }, { status: 400 });
    }
    const ids = await setModelWhitelist(body.ids);
    return NextResponse.json({ success: true, ids });
  } catch (error) {
    console.log("Error saving model whitelist:", error);
    return NextResponse.json({ error: "Failed to save model whitelist" }, { status: 500 });
  }
}

// DELETE /api/models/whitelist → 清空（恢复不过滤）
export async function DELETE() {
  try {
    const ids = await setModelWhitelist([]);
    return NextResponse.json({ success: true, ids });
  } catch (error) {
    console.log("Error clearing model whitelist:", error);
    return NextResponse.json({ error: "Failed to clear model whitelist" }, { status: 500 });
  }
}
