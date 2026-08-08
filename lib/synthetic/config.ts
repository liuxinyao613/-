import { AITelemetryRole } from "@/lib/domain/schemas";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek-provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai-provider";
import type { AIProvider } from "@/lib/ai/provider";

export type ProductTarget = "sol" | "deepseek";

export const SYNTHETIC_SOFT_TOKEN_WARNING = 100_000;
export const SYNTHETIC_HARD_TOKEN_BUDGET = 150_000;
export const SYNTHETIC_DEFAULT_CONCURRENCY = 2;

const optional = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export type SimulatorProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string | null;
  thinking: "enabled" | "disabled" | null;
  structuredOutputMode: "json_schema" | "json_object";
  providerName: string;
  timeoutMs: number;
};

export function getSimulatorConfig(): SimulatorProviderConfig {
  return {
    baseUrl:
      process.env.SIMULATOR_AI_BASE_URL ??
      process.env.PRODUCT_AI_BASE_URL ??
      process.env.AI_BASE_URL ??
      "https://api.openai.com/v1",
    apiKey:
      process.env.SIMULATOR_AI_API_KEY ??
      process.env.PRODUCT_AI_API_KEY ??
      process.env.AI_API_KEY ??
      "",
    model:
      process.env.SIMULATOR_AI_MODEL ??
      process.env.PRODUCT_AI_MODEL ??
      process.env.AI_MODEL ??
      "",
    reasoningEffort: optional(
      process.env.SIMULATOR_AI_REASONING_EFFORT ?? process.env.AI_REASONING_EFFORT,
    ),
    thinking:
      optional(process.env.SIMULATOR_AI_THINKING) === "enabled"
        ? "enabled"
        : optional(process.env.SIMULATOR_AI_THINKING) === "disabled"
          ? "disabled"
          : null,
    structuredOutputMode:
      optional(process.env.SIMULATOR_AI_STRUCTURED_OUTPUT) === "json_object"
        ? "json_object"
        : "json_schema",
    providerName: process.env.SIMULATOR_AI_PROVIDER_NAME ?? "simulator-openai-compatible",
    timeoutMs: 90_000,
  };
}

export function getProductProvider(target: ProductTarget): {
  provider: AIProvider;
  providerName: string;
  model: string;
} {
  if (target === "deepseek") {
    const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";
    const providerName = "deepseek-official";
    const provider = new DeepSeekProvider({
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
      apiKey: process.env.DEEPSEEK_API_KEY ?? "",
      model,
      reasoningEffort: null,
      providerName,
      structuredOutputMode: "json_object",
      timeoutMs: positiveInteger(
        process.env.SYNTHETIC_PRODUCT_TIMEOUT_MS,
        180_000,
      ),
      roleOptions: {
        [AITelemetryRole.ANSWER_INTERPRETER]: {
          thinking:
            optional(process.env.DEEPSEEK_INTERPRETER_THINKING) === "disabled"
              ? "disabled"
              : "enabled",
          reasoningEffort: optional(
            process.env.DEEPSEEK_INTERPRETER_REASONING_EFFORT,
          ) ?? "max",
          maxTokens: positiveInteger(
            process.env.DEEPSEEK_INTERPRETER_MAX_TOKENS,
            4_096,
          ),
        },
        [AITelemetryRole.PROBE_PLANNER]: {
          thinking:
            optional(process.env.DEEPSEEK_PLANNER_THINKING) === "disabled"
              ? "disabled"
              : "enabled",
          reasoningEffort:
            optional(process.env.DEEPSEEK_PLANNER_REASONING_EFFORT) ?? "max",
          maxTokens: positiveInteger(
            process.env.DEEPSEEK_PLANNER_MAX_TOKENS,
            8_192,
          ),
        },
        [AITelemetryRole.REPORT_WRITER]: {
          thinking:
            optional(process.env.DEEPSEEK_REPORT_THINKING) === "disabled"
              ? "disabled"
              : "enabled",
          reasoningEffort:
            optional(process.env.DEEPSEEK_REPORT_REASONING_EFFORT) ?? "max",
          maxTokens: positiveInteger(
            process.env.DEEPSEEK_REPORT_MAX_TOKENS,
            24_576,
          ),
        },
      },
    });
    return { provider, providerName, model };
  }

  const model =
    process.env.PRODUCT_AI_MODEL ?? process.env.AI_MODEL ?? "not-configured";
  const providerName = "sol-openai-compatible";
  return {
    provider: new OpenAIProvider({
      baseUrl:
        process.env.PRODUCT_AI_BASE_URL ??
        process.env.AI_BASE_URL ??
        "https://api.openai.com/v1",
      apiKey: process.env.PRODUCT_AI_API_KEY ?? process.env.AI_API_KEY ?? "",
      model,
      reasoningEffort:
        optional(
          process.env.PRODUCT_AI_REASONING_EFFORT ?? process.env.AI_REASONING_EFFORT,
        ) ?? "xhigh",
      providerName,
      structuredOutputMode: "json_schema",
      timeoutMs: positiveInteger(
        process.env.SYNTHETIC_PRODUCT_TIMEOUT_MS,
        180_000,
      ),
    }),
    providerName,
    model,
  };
}
