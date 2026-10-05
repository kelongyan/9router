import { DefaultExecutor } from "./default.js";

// Some new-api style Claude relays accept streaming requests but stream only
// message_start / message_delta / message_stop — no content_block_* events —
// so streamed replies arrive empty while non-stream responses carry full
// content. Connections to such relays can set
// providerSpecificData.forceNonStreamUpstream = true: the executor then always
// fetches non-stream and feeds the client a synthesized standard SSE stream.

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildSseBody(message) {
  const usage = message?.usage || {};
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const parts = [];

  parts.push(
    sseEvent("message_start", {
      type: "message_start",
      message: {
        id: message?.id || "msg_synth",
        type: "message",
        role: "assistant",
        model: message?.model || "",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: 0 },
      },
    })
  );

  blocks.forEach((block, index) => {
    if (!block || typeof block !== "object") return;
    if (block.type === "text") {
      parts.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }));
      parts.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text ?? "" } }));
      parts.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    } else if (block.type === "tool_use") {
      parts.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }));
      parts.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) } }));
      parts.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    } else if (block.type === "thinking") {
      parts.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } }));
      parts.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking ?? "" } }));
      parts.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    }
  });

  parts.push(
    sseEvent("message_delta", {
      type: "message_delta",
      delta: { stop_reason: message?.stop_reason ?? "end_turn", stop_sequence: null },
      usage: { output_tokens: usage.output_tokens ?? 0 },
    })
  );
  parts.push(sseEvent("message_stop", { type: "message_stop" }));

  return parts.join("");
}

export class AnthropicCompatExecutor extends DefaultExecutor {
  async execute(args) {
    const force = args?.stream === true && args?.credentials?.providerSpecificData?.forceNonStreamUpstream === true;
    if (!force) return super.execute(args);

    // Non-stream upstream: the body must carry stream:false too — for
    // /v1/messages the stream switch lives in the body, not the URL.
    const result = await super.execute({
      ...args,
      stream: false,
      body: { ...(args.body || {}), stream: false },
    });

    const response = result?.response;
    const contentType = response?.headers?.get?.("content-type") || "";
    if (!response?.ok || !contentType.includes("application/json")) return result;

    const message = await response.json().catch(() => null);
    if (!message) return result;

    return {
      ...result,
      response: new Response(buildSseBody(message), {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
      }),
    };
  }
}
