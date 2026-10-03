// 模型白名单存储（全局）—— 本机定制，使用 kv 表的独立 scope。
//
// 为什么直接调底层 getAdapter：本机定制的存储层不走 localDb / db/index.js /
// models/index.js 那条四层 shim 链，避免为定制在上游文件里新增导出（见
// RULE §13 / docs/CUSTOMIZATION.md「零冲突层」原则）。
//
// 与既有 disabledModels（黑名单）互不影响：scope 不同。
import { getAdapter } from "./db/driver.js";
import { parseJson, stringifyJson } from "./db/helpers/jsonCol.js";

const SCOPE = "modelWhitelist";
const KEY = "global";

/**
 * 读取白名单（完整模型 id 数组，如 ["ag/gemini-3.8-flash", "atria/*"]）。
 * 未设置 / 解析失败 / DB 异常时一律返回 []（= 不过滤）。
 */
export async function getModelWhitelist() {
  try {
    const db = await getAdapter();
    const row = db.get(`SELECT value FROM kv WHERE scope = ? AND key = ?`, [SCOPE, KEY]);
    const list = row ? parseJson(row.value, []) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((x) => typeof x === "string" && x.trim() !== "");
  } catch (e) {
    console.log("Could not read model whitelist:", e?.message || e);
    return [];
  }
}

/**
 * 覆盖写入白名单。传空数组（或非数组）等价于清空 → 恢复「不过滤」。
 * 自动去重 + 去空白。
 */
export async function setModelWhitelist(ids) {
  const db = await getAdapter();
  const list = Array.isArray(ids)
    ? [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))]
    : [];

  db.transaction(() => {
    if (list.length === 0) {
      db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [SCOPE, KEY]);
      return;
    }
    db.run(
      `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
      [SCOPE, KEY, stringifyJson(list)]
    );
  });

  return list;
}
