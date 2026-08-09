import { OpenAIProvider } from "./providers/openai-provider";
import { ProviderCallError } from "./provider";
import { AITelemetryRole } from "@/lib/domain/schemas";
import type { AIRoleRequestOptions } from "./config";

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getServerAIRoleOptions(
  environment: Record<string, string | undefined> = process.env,
): Partial<Record<AITelemetryRole, AIRoleRequestOptions>> {
  const sharedEffort =
    environment.PRODUCT_AI_REASONING_EFFORT ??
    environment.AI_REASONING_EFFORT ??
    "xhigh";
  return {
    [AITelemetryRole.ANSWER_INTERPRETER]: {
      reasoningEffort:
        environment.PRODUCT_AI_INTERPRETER_REASONING_EFFORT ?? "medium",
      timeoutMs: positiveInteger(
        environment.PRODUCT_AI_INTERPRETER_TIMEOUT_MS,
        45_000,
      ),
    },
    [AITelemetryRole.PROBE_PLANNER]: {
      reasoningEffort:
        environment.PRODUCT_AI_PLANNER_REASONING_EFFORT ?? sharedEffort,
      timeoutMs: positiveInteger(
        environment.PRODUCT_AI_PLANNER_TIMEOUT_MS,
        90_000,
      ),
    },
    [AITelemetryRole.REPORT_WRITER]: {
      reasoningEffort:
        environment.PRODUCT_AI_REPORT_REASONING_EFFORT ?? sharedEffort,
      timeoutMs: positiveInteger(
        environment.PRODUCT_AI_REPORT_TIMEOUT_MS,
        180_000,
      ),
    },
  };
}

export function getServerAIProvider() {
  return new OpenAIProvider({ roleOptions: getServerAIRoleOptions() });
}

export function providerErrorResponse(error: unknown): Response {
  const providerError =
    error instanceof ProviderCallError
      ? error
      : new ProviderCallError(
          error instanceof Error ? error.message : "Unknown AI route error.",
          "ROUTE_ERROR",
        );
  return Response.json(
    {
      ok: false,
      error: { type: providerError.errorType, message: providerError.message },
      telemetry: providerError.telemetry,
    },
    { status: providerError.errorType === "CONFIGURATION" ? 503 : 502 },
  );
}
