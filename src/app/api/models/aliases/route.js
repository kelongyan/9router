// 模型别名管理 API（本机定制）
//   GET    → { aliases }                    alias → "provider/model"
//   PUT    → body { alias, target }         设置/更新（alias 必须是无斜杠短名）
//   DELETE → ?alias=xxx 或 body { alias }   删除
//
// 认证：/api/* 默认 deny-by-default，由 src/dashboardGuard.js 统一要求 dashboard 登录态。
import { NextResponse } from "next/server";
import {
  getModelAliases,
  setModelAlias,
  deleteModelAlias,
} from "@/lib/db/repos/aliasRepo";
import { getComboByName } from "@/lib/localDb";
import { buildModelsList } from "@/app/api/v1/models/route.js";

export const dynamic = "force-dynamic";

// 管理页必须能看到「所有类型」的模型，才能给图片/语音/嵌入模型起别名。
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

// 别名是「无斜杠短名」：请求入口的别名解析（getModelInfo → parseModel 的
// isAlias 分支）只对不含 "/" 的 model 字符串查别名表——带斜杠的别名永远不会
// 被解析到，所以从一开始就不允许。
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export async function GET() {
  try {
    const aliases = await getModelAliases();
    return NextResponse.json({ aliases: aliases || {} });
  } catch (error) {
    console.log("Error fetching model aliases:", error);
    return NextResponse.json({ error: "Failed to fetch model aliases" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const alias = typeof body?.alias === "string" ? body.alias.trim() : "";
    const target = typeof body?.target === "string" ? body.target.trim() : "";

    if (!ALIAS_RE.test(alias)) {
      return NextResponse.json(
        { error: "Invalid alias: letters, digits, dot, dash, underscore only (no slash), max 64 chars" },
        { status: 400 }
      );
    }
    if (!target || !target.includes("/")) {
      return NextResponse.json(
        { error: "target must be a real model id (provider/model)" },
        { status: 400 }
      );
    }

    // target 必须真实存在（全量列表，不受白名单影响）
    const all = await buildModelsList(ALL_KINDS, { skipWhitelist: true });
    const available = new Set(all.map((m) => m?.id).filter(Boolean));
    if (!available.has(target)) {
      return NextResponse.json({ error: `Unknown model: ${target}` }, { status: 400 });
    }

    // combo 名在请求解析里优先于别名，撞车会让别名永远不生效——直接拒绝。
    if (await getComboByName(alias)) {
      return NextResponse.json({ error: `"${alias}" is already a combo name` }, { status: 400 });
    }

    // 同一真实 id 只保留一个展示别名：设置前清掉指向它的旧别名（改名的常规路径）。
    const existing = (await getModelAliases()) || {};
    for (const [oldAlias, oldTarget] of Object.entries(existing)) {
      if (oldTarget === target && oldAlias !== alias) await deleteModelAlias(oldAlias);
    }

    await setModelAlias(alias, target);
    return NextResponse.json({ success: true, aliases: await getModelAliases() });
  } catch (error) {
    console.log("Error saving model alias:", error);
    return NextResponse.json({ error: "Failed to save model alias" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    let alias = searchParams.get("alias") || "";
    if (!alias) {
      const body = await request.json().catch(() => ({}));
      alias = typeof body?.alias === "string" ? body.alias.trim() : "";
    }
    if (!alias) {
      return NextResponse.json({ error: "alias required" }, { status: 400 });
    }
    await deleteModelAlias(alias);
    return NextResponse.json({ success: true, aliases: await getModelAliases() });
  } catch (error) {
    console.log("Error deleting model alias:", error);
    return NextResponse.json({ error: "Failed to delete model alias" }, { status: 500 });
  }
}
