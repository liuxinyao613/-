import {
  AITelemetryRole,
  AITelemetrySchema,
  type AITelemetry,
} from "@/lib/domain/schemas";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function finiteInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
  }
  return null;
}

export function normalizeUsage(raw: unknown) {
  const root = record(raw);
  const usage = record(root.usage);
  const promptDetails = record(usage.prompt_tokens_details ?? usage.input_tokens_details);
  const completionDetails = record(
    usage.completion_tokens_details ?? usage.output_tokens_details,
  );
  const inputTokens = finiteInteger(usage.input_tokens, usage.prompt_tokens) ?? 0;
  const outputTokens = finiteInteger(usage.output_tokens, usage.completion_tokens) ?? 0;
  return {
    inputTokens,
    cachedInputTokens: finiteInteger(
      usage.cached_input_tokens,
      usage.cached_tokens,
      promptDetails.cached_tokens,
    ),
    outputTokens,
    reasoningTokens: finiteInteger(
      usage.reasoning_tokens,
      completionDetails.reasoning_tokens,
    ),
    totalTokens: finiteInteger(usage.total_tokens) ?? inputTokens + outputTokens,
  };
}

function contentFromParts(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;
  return parts
    .map((part) => {
      const item = record(part);
      return typeof item.text === "string" ? item.text : "";
    })
    .filter(Boolean)
    .join("");
}

function contentFromResponsesOutput(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  return output
    .map((item) => contentFromParts(record(item).content) ?? "")
    .filter(Boolean)
    .join("");
}

export function normalizeResponseContent(raw: unknown): unknown {
  const root = record(raw);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = record(record(choices[0]).message);
  if (message.parsed && typeof message.parsed === "object") return message.parsed;
  const chatContent =
    typeof message.content === "string"
      ? message.content
      : contentFromParts(message.content);
  const responseContent =
    typeof root.output_text === "string"
      ? root.output_text
      : contentFromResponsesOutput(root.output);
  const content = chatContent ?? responseContent;
  if (!content) throw new Error("Provider response did not contain structured content.");
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(withoutFence);
}

export function makeTelemetry(input: {
  sessionId: string;
  role: AITelemetryRole;
  provider: string;
  requestedModel: string;
  returnedModel?: string | null;
  reasoningEffort?: string | null;
  rawResponse?: unknown;
  latencyMs: number;
  success: boolean;
  errorType?: string | null;
  timestamp?: string;
}): AITelemetry {
  const usage = normalizeUsage(input.rawResponse);
  return AITelemetrySchema.parse({
    id: `telemetry-${crypto.randomUUID()}`,
    sessionId: input.sessionId,
    role: input.role,
    provider: input.provider,
    requestedModel: input.requestedModel || "not-configured",
    returnedModel: input.returnedModel ?? null,
    reasoningEffort: input.reasoningEffort ?? null,
    ...usage,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    success: input.success,
    errorType: input.errorType ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}

export function returnedModel(raw: unknown): string | null {
  const model = record(raw).model;
  return typeof model === "string" ? model : null;
}
