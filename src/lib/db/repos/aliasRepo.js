import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { makeKv } from "../helpers/kvStore.js";

const aliasKv = makeKv("modelAliases");
const customKv = makeKv("customModels");
const mitmKv = makeKv("mitmAlias");

// modelAliases: key=alias, value=modelString
export async function getModelAliases() {
  return await aliasKv.getAll();
}

export async function setModelAlias(alias, model) {
  await aliasKv.set(alias, model);
}

export async function deleteModelAlias(alias) {
  await aliasKv.remove(alias);
}

// customModels: key=`${providerAlias}|${id}|${type}`, value=full model object
function customKey(providerAlias, id, type) {
  return `${providerAlias}|${id}|${type}`;
}

export async function getCustomModels() {
  const all = await customKv.getAll();
  return Object.values(all);
}

// Atomic upsert inside transaction to prevent duplicate races.
// Re-adding an existing model updates caps/name without resetting omitted fields.
export async function addCustomModel({ providerAlias, id, type = "llm", name, caps }) {
  const k = customKey(providerAlias, id, type);
  const db = await getAdapter();
  let added = false;
  db.transaction(() => {
    const row = db.get(`SELECT value FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
    if (row) {
      const prev = parseJson(row.value) || {};
      const next = { ...prev, ...(name ? { name } : {}), ...(caps ? { caps } : {}) };
      db.run(`UPDATE kv SET value = ? WHERE scope = 'customModels' AND key = ?`, [stringifyJson(next), k]);
      return;
    }
    const value = stringifyJson({ providerAlias, id, type, name: name || id, ...(caps ? { caps } : {}) });
    db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [k, value]);
    added = true;
  });
  return added;
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  await customKv.remove(customKey(providerAlias, id, type));
}

// Batch insert in a single transaction — used by the model picker, where the user
// picks a handful out of a few hundred. Existing entries are left untouched (the
// picker marks them as already added, so re-adding must not clobber their caps).
export async function addCustomModels({ providerAlias, type = "llm", ids }) {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))] : [];
  if (!providerAlias || list.length === 0) return 0;
  const db = await getAdapter();
  let added = 0;
  db.transaction(() => {
    for (const id of list) {
      const k = customKey(providerAlias, id, type);
      const row = db.get(`SELECT value FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
      if (row) continue;
      db.run(`INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)`, [
        k,
        stringifyJson({ providerAlias, id, type, name: id }),
      ]);
      added += 1;
    }
  });
  return added;
}

// Remove every custom model of a provider. `type` narrows it to one kind (e.g. "llm"),
// so clearing the model list never takes embedding/tts entries with it.
export async function deleteCustomModelsByProvider({ providerAlias, type }) {
  if (!providerAlias) return 0;
  const db = await getAdapter();
  const rows = db.all(`SELECT key FROM kv WHERE scope = 'customModels'`, []);
  const victims = rows
    .map((r) => r.key)
    .filter((k) => k.startsWith(`${providerAlias}|`) && (!type || k.endsWith(`|${type}`)));
  if (victims.length === 0) return 0;
  db.transaction(() => {
    for (const k of victims) {
      db.run(`DELETE FROM kv WHERE scope = 'customModels' AND key = ?`, [k]);
    }
  });
  return victims.length;
}

// mitmAlias: key=toolName, value=mappings object
export async function getMitmAlias(toolName) {
  if (toolName) {
    const v = await mitmKv.get(toolName);
    return v || {};
  }
  return await mitmKv.getAll();
}

export async function setMitmAliasAll(toolName, mappings) {
  await mitmKv.set(toolName, mappings || {});
}
