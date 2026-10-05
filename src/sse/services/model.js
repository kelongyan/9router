// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes } from "@/lib/localDb";
import { parseModel as parseModelCore, resolveModelAliasFromMap, getModelInfoCore } from "open-sse/services/model.js";
import REGISTRY from "open-sse/providers/registry/index.js";

// Local provider alias overrides (HMR-friendly, applied on top of open-sse map)
const LOCAL_PROVIDER_ALIASES = {
  xmtp: "xiaomi-tokenplan",
  "xiaomi-tokenplan": "xiaomi-tokenplan",
};

const RESERVED_PROVIDER_PREFIXES = new Set(Object.keys(LOCAL_PROVIDER_ALIASES));
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr) {
  const parsed = parseModelCore(modelStr);
  if (parsed?.providerAlias && LOCAL_PROVIDER_ALIASES[parsed.providerAlias]) {
    return { ...parsed, provider: LOCAL_PROVIDER_ALIASES[parsed.providerAlias] };
  }
  return parsed;
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias) {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve)
 */
// Map a user-defined provider-node prefix ("anzhiyu", …) to its
// node id. Returns null when the prefix belongs to no node.
async function resolveNodeProviderId(providerAlias) {
  const openaiNodes = await getProviderNodes({ type: "openai-compatible" });
  const matchedOpenAI = openaiNodes.find((node) => node.prefix === providerAlias);
  if (matchedOpenAI) return matchedOpenAI.id;

  const anthropicNodes = await getProviderNodes({ type: "anthropic-compatible" });
  const matchedAnthropic = anthropicNodes.find((node) => node.prefix === providerAlias);
  if (matchedAnthropic) return matchedAnthropic.id;

  const embeddingNodes = await getProviderNodes({ type: "custom-embedding" });
  const matchedEmbedding = embeddingNodes.find((node) => node.prefix === providerAlias);
  if (matchedEmbedding) return matchedEmbedding.id;

  return null;
}

export async function getModelInfo(modelStr) {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    // Provider-node prefixes are user-defined. They must not override built-in
    // provider ids/aliases such as `cf`, `cloudflare-ai`, `openai`, or `hf`.
    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      const nodeId = await resolveNodeProviderId(parsed.providerAlias);
      if (nodeId) {
        return { provider: nodeId, model: parsed.model };
      }
    }
    return {
      provider: parsed.provider,
      model: parsed.model
    };
  }

  // Check if this is a combo name before resolving as alias
  // This prevents combo names from being incorrectly routed to providers
  const combo = await getComboByName(parsed.model);
  if (combo) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  const resolved = await getModelInfoCore(modelStr, getModelAliases);
  // Alias targets may use provider-node prefixes ("anzhiyu/gpt-6-astra").
  // getModelInfoCore only knows registry aliases, so without this mapping the
  // credentials lookup runs against the raw prefix and fails with
  // "No active credentials for provider: <prefix>".
  if (resolved?.provider && !RESERVED_PROVIDER_PREFIXES.has(resolved.provider)) {
    const nodeId = await resolveNodeProviderId(resolved.provider);
    if (nodeId) {
      return { provider: nodeId, model: resolved.model };
    }
  }
  return resolved;
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr) {
  // Only check if it's not in provider/model format
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}
