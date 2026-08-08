export type AIProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string | null;
  providerName: string;
  timeoutMs: number;
};

export function getAIProviderConfig(overrides: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return {
    baseUrl: overrides.baseUrl ?? process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: overrides.apiKey ?? process.env.AI_API_KEY ?? "",
    model: overrides.model ?? process.env.AI_MODEL ?? "",
    reasoningEffort:
      overrides.reasoningEffort ?? process.env.AI_REASONING_EFFORT ?? null,
    providerName: overrides.providerName ?? "openai-compatible",
    timeoutMs: overrides.timeoutMs ?? 90_000,
  };
}
