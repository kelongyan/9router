import { buildModelsList } from "@/app/api/v1/models/route.js";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

// [local] 模型列表必须与 /v1/models 同源：buildModelsList 出口统一走白名单
// 过滤 + 别名替换 + disabled 剔除。原实现直接遍历静态 PROVIDER_MODELS 目录，
// 完全绕过了这些过滤——白名单开着时 Gemini 协议客户端仍能拉到全量模型。
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

/**
 * GET /v1beta/models - Gemini compatible models list
 * Returns models in Gemini API format, filtered like GET /v1/models.
 */
export async function GET() {
  try {
    const data = await buildModelsList(ALL_KINDS);
    const models = data.map((m) => {
      const entry = {
        name: `models/${m.id}`,
        displayName: m.id,
        description: `${m.owned_by ? `${m.owned_by} model: ` : "model: "}${m.id}`,
        // The proxy accepts both streaming and non-streaming generateContent.
        supportedGenerationMethods: ["generateContent", "streamGenerateContent"],
        inputTokenLimit: 128000,
        outputTokenLimit: 8192,
      };
      if (Number.isFinite(m.context_length)) entry.inputTokenLimit = m.context_length;
      if (Number.isFinite(m.max_completion_tokens)) entry.outputTokenLimit = m.max_completion_tokens;
      return entry;
    });

    return Response.json({ models });
  } catch (error) {
    console.log("Error fetching models:", error);
    return Response.json({ error: { message: error.message } }, { status: 500 });
  }
}
