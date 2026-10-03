// 模型白名单过滤（本机定制）—— 纯逻辑集中在这里，便于单独验证。
//
// 规则：
//   1. 白名单为空 → 原样返回（默认行为完全不变，向后兼容）★
//   2. 条目是完整模型 id，形如 "ag/gemini-3.8-flash"
//   3. 支持 "alias/*" 通配，表示保留该 provider 的全部模型
//   4. 读白名单失败时 fail-open（不过滤），绝不让列表变空
// 过滤点唯一：open-sse 侧 buildModelsList 的出口，因此 /v1/models、
// /v1/models/{kind}、/v1/models/{provider}/{model} 三个入口行为一致，
// 也与请求来自公网 URL 还是 127.0.0.1 无关。
import { getModelWhitelist } from "./modelWhitelistDb.js";

const WILDCARD_SUFFIX = "/*";
const SLASH = "/";

/** 把白名单条目编译成匹配函数。 */
function buildMatcher(whitelist) {
  const exact = new Set();
  const wildcardAliases = new Set();

  for (const entry of whitelist) {
    if (entry.endsWith(WILDCARD_SUFFIX)) {
      const alias = entry.slice(0, -WILDCARD_SUFFIX.length);
      if (alias) wildcardAliases.add(alias);
    } else {
      exact.add(entry);
    }
  }

  return (modelId) => {
    if (exact.has(modelId)) return true;
    const slash = modelId.indexOf(SLASH);
    if (slash > 0 && wildcardAliases.has(modelId.slice(0, slash))) return true;
    return false;
  };
}

/**
 * 按白名单过滤模型列表。
 * @param {Array<{id?: string}>} models buildModelsList 产出的模型条目
 * @returns {Promise<Array>} 过滤后的列表（白名单为空时原样返回）
 */
export async function applyWhitelist(models) {
  if (!Array.isArray(models) || models.length === 0) return models;

  let whitelist = [];
  try {
    whitelist = await getModelWhitelist();
  } catch {
    return models;
  }
  if (whitelist.length === 0) return models;

  const matches = buildMatcher(whitelist);
  return models.filter((m) => typeof m?.id === "string" && matches(m.id));
}
