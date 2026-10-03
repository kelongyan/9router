// [local] 模型别名（本机定制）
//
// /v1/models 对外展示层：把设置了别名的真实 id（provider/model）替换成好记的
// 短别名。请求入口的别名 → 真实 id 解析由既有机制完成（getModelInfo →
// getModelAliases，只对不含 "/" 的 model 字符串查别名表），本文件只负责出口替换。
//
// 语义：
//   - 别名表（kv scope=modelAliases）形如 { "fast-gpt": "atria/Atria-Dawn-Preview" }
//   - 同一真实 id 只展示一个别名（后设者赢，管理 API 负责清理旧映射）
//   - DB 异常 fail-open：照常展示真实 id，不影响 /v1/models
//   - skipWhitelist 调用方（dashboard 管理页）不走这里 —— 管理页必须看到真实 id
import { getModelAliases } from "@/lib/db/repos/aliasRepo";

export async function applyModelAliases(models) {
  if (!Array.isArray(models) || models.length === 0) return models;

  let aliasMap;
  try {
    aliasMap = await getModelAliases();
  } catch (e) {
    console.log("[modelAliases] load failed, showing real ids:", e?.message || e);
    return models;
  }
  if (!aliasMap || typeof aliasMap !== "object") {
    console.log("[modelAliases] empty/invalid alias map:", typeof aliasMap);
    return models;
  }

  // 反向索引：realId -> alias（一真实 id 仅一个展示别名）
  const aliasByRealId = new Map();
  for (const [alias, target] of Object.entries(aliasMap)) {
    if (typeof alias !== "string" || !alias) continue;
    if (typeof target !== "string" || !target) continue;
    if (!aliasByRealId.has(target)) aliasByRealId.set(target, alias);
  }
  if (aliasByRealId.size === 0) {
    console.log("[modelAliases] no valid entries in:", JSON.stringify(aliasMap).slice(0, 200));
    return models;
  }

  console.log(
    "[modelAliases] replacing ids:",
    JSON.stringify([...aliasByRealId.entries()]).slice(0, 200)
  );
  return models.map((m) => {
    const realId = typeof m?.id === "string" ? m.id : "";
    const alias = realId && aliasByRealId.get(realId);
    return alias ? { ...m, id: alias } : m;
  });
}
