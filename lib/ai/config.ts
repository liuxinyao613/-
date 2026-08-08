import type { AITelemetryRole } from "@/lib/domain/schemas";

export type AIRoleRequestOptions = {
  reasoningEffort?: string | null;
  thinking?: "enabled" | "disabled" | null;
  maxTokens?: number | null;
};

export type AIProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string | null;
  providerName: string;
  timeoutMs: number;
  roleOptions?: Partial<Record<AITelemetryRole, AIRoleRequestOptions>>;
  structuredOutputMode?: "json_schema" | "json_object";
};

export function getAIProviderConfig(overrides: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return {
    baseUrl:
      overrides.baseUrl ??
      process.env.PRODUCT_AI_BASE_URL ??
      process.env.AI_BASE_URL ??
      "https://api.openai.com/v1",
    apiKey: overrides.apiKey ?? process.env.PRODUCT_AI_API_KEY ?? process.env.AI_API_KEY ?? "",
    model: overrides.model ?? process.env.PRODUCT_AI_MODEL ?? process.env.AI_MODEL ?? "",
    reasoningEffort:
      overrides.reasoningEffort ??
      process.env.PRODUCT_AI_REASONING_EFFORT ??
      process.env.AI_REASONING_EFFORT ??
      null,
    providerName: overrides.providerName ?? "openai-compatible",
    timeoutMs: overrides.timeoutMs ?? 90_000,
    roleOptions: overrides.roleOptions,
    structuredOutputMode: overrides.structuredOutputMode ?? "json_schema",
  };
}
