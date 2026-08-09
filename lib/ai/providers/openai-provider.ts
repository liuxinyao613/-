import { z } from "zod";
import {
  AnswerInterpretationPayloadSchema,
  InterpretAnswerInputSchema,
  PlanProbeInputSchema,
  PlanProbeOutputSchema,
  ProbePlanPayloadSchema,
  ReportWriterPayloadSchema,
  WriteReportInputSchema,
  WriteReportOutputSchema,
  type InterpretAnswerInput,
  type PlanProbeInput,
  type WriteReportInput,
} from "../contracts";
import { getAIProviderConfig, type AIProviderConfig } from "../config";
import { normalizeInterpretation } from "../interpretation-policy";
import {
  makeTelemetry,
  normalizeResponseContent,
  returnedModel,
} from "../normalization";
import {
  interpreterSystemPrompt,
  interpreterUserPrompt,
  plannerSystemPrompt,
  plannerUserPrompt,
  reportSystemPrompt,
  reportUserPrompt,
} from "../prompts";
import {
  AITelemetryRole,
  type AITelemetry,
} from "@/lib/domain/schemas";
import { normalizeAIReport } from "@/lib/report/normalize-ai-report";
import type { AIProvider, AIProviderResult } from "../provider";
import { ProviderCallError } from "../provider";

function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

export class OpenAIProvider implements AIProvider {
  protected readonly config: AIProviderConfig;

  constructor(overrides: Partial<AIProviderConfig> = {}) {
    this.config = getAIProviderConfig(overrides);
  }

  private async requestStructured<T>(input: {
    sessionId: string;
    role: AITelemetryRole;
    schema: z.ZodType<T>;
    schemaName: string;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<AIProviderResult<T>> {
    const started = performance.now();
    let rawResponse: unknown;
    let telemetry: AITelemetry | undefined;

    const roleOptions = this.config.roleOptions?.[input.role];
    const reasoningEffort =
      roleOptions && "reasoningEffort" in roleOptions
        ? roleOptions.reasoningEffort ?? null
        : this.config.reasoningEffort;
    const thinking = roleOptions?.thinking ?? null;
    const telemetryEffort = [
      thinking ? `thinking:${thinking}` : null,
      reasoningEffort ? `effort:${reasoningEffort}` : null,
    ]
      .filter(Boolean)
      .join("/") || null;

    if (!this.config.apiKey || !this.config.model) {
      telemetry = makeTelemetry({
        sessionId: input.sessionId,
        role: input.role,
        provider: this.config.providerName,
        requestedModel: this.config.model,
        reasoningEffort: telemetryEffort,
        latencyMs: performance.now() - started,
        success: false,
        errorType: "CONFIGURATION",
      });
      throw new ProviderCallError(
        "AI_API_KEY and AI_MODEL must be configured on the server.",
        "CONFIGURATION",
        telemetry,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      roleOptions?.timeoutMs ?? this.config.timeoutMs,
    );

    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: [
          {
            role: "system",
            content:
              this.config.structuredOutputMode === "json_object"
                ? `${input.systemPrompt}\n只输出符合下列 JSON Schema 的合法 JSON 对象，不要输出 Markdown，不要省略 required 字段：\n${JSON.stringify(z.toJSONSchema(input.schema))}`
                : input.systemPrompt,
          },
          { role: "user", content: input.userPrompt },
        ],
        response_format:
          this.config.structuredOutputMode === "json_object"
            ? { type: "json_object" }
            : {
                type: "json_schema",
                json_schema: {
                  name: input.schemaName,
                  strict: true,
                  schema: z.toJSONSchema(input.schema),
                },
              },
      };
      if (reasoningEffort) {
        body.reasoning_effort = reasoningEffort;
      }
      if (thinking) {
        body.thinking = { type: thinking };
      }
      if (roleOptions?.maxTokens) {
        body.max_tokens = roleOptions.maxTokens;
      }

      const response = await fetch(endpointFor(this.config.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      try {
        rawResponse = text ? JSON.parse(text) : {};
      } catch {
        rawResponse = { raw_text: text };
      }
      if (!response.ok) {
        throw new ProviderCallError(
          `AI provider returned HTTP ${response.status}.`,
          `HTTP_${response.status}`,
        );
      }

      const parsed = input.schema.parse(normalizeResponseContent(rawResponse));
      telemetry = makeTelemetry({
        sessionId: input.sessionId,
        role: input.role,
        provider: this.config.providerName,
        requestedModel: this.config.model,
        returnedModel: returnedModel(rawResponse),
        reasoningEffort: telemetryEffort,
        rawResponse,
        latencyMs: performance.now() - started,
        success: true,
      });
      return { data: parsed, telemetry };
    } catch (error) {
      const errorType =
        error instanceof ProviderCallError
          ? error.errorType
          : error instanceof z.ZodError
            ? "SCHEMA_VALIDATION"
            : error instanceof SyntaxError
              ? "INVALID_JSON"
              : controller.signal.aborted
                ? "TIMEOUT"
                : "NETWORK_OR_PROVIDER";
      telemetry ??= makeTelemetry({
        sessionId: input.sessionId,
        role: input.role,
        provider: this.config.providerName,
        requestedModel: this.config.model,
        returnedModel: returnedModel(rawResponse),
        reasoningEffort: telemetryEffort,
        rawResponse,
        latencyMs: performance.now() - started,
        success: false,
        errorType,
      });
      throw new ProviderCallError(
        error instanceof Error ? error.message : "Unknown provider error.",
        errorType,
        telemetry,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async interpretAnswer(inputValue: InterpretAnswerInput) {
    const input = InterpretAnswerInputSchema.parse(inputValue);
    const result = await this.requestStructured({
      sessionId: input.response.sessionId,
      role: AITelemetryRole.ANSWER_INTERPRETER,
      schema: AnswerInterpretationPayloadSchema,
      schemaName: "answer_interpretation",
      systemPrompt: interpreterSystemPrompt,
      userPrompt: interpreterUserPrompt(input),
    });
    return { data: normalizeInterpretation(result.data, input), telemetry: result.telemetry };
  }

  async planProbe(inputValue: PlanProbeInput) {
    const input = PlanProbeInputSchema.parse(inputValue);
    const result = await this.requestStructured({
      sessionId: input.session.id,
      role: AITelemetryRole.PROBE_PLANNER,
      schema: ProbePlanPayloadSchema,
      schemaName: "probe_plan",
      systemPrompt: plannerSystemPrompt,
      userPrompt: plannerUserPrompt(input),
    });
    return {
      data: PlanProbeOutputSchema.parse({
        ...result.data,
        intents: result.data.intents.map((intent) => ({
          ...intent,
          id: `intent-${crypto.randomUUID()}`,
        })),
      }),
      telemetry: result.telemetry,
    };
  }

  generateQuestion(): Promise<never> {
    return Promise.reject(
      new ProviderCallError(
        "AI question generation is disabled in Phase 2.",
        "QUESTION_GENERATION_DISABLED",
      ),
    );
  }

  async writeReport(inputValue: WriteReportInput) {
    const input = WriteReportInputSchema.parse(inputValue);
    const result = await this.requestStructured({
      sessionId: input.session.id,
      role: AITelemetryRole.REPORT_WRITER,
      schema: ReportWriterPayloadSchema,
      schemaName: "relationship_boundary_report",
      systemPrompt: reportSystemPrompt,
      userPrompt: reportUserPrompt(input),
    });
    return {
      data: WriteReportOutputSchema.parse({
        report: normalizeAIReport(result.data, input),
      }),
      telemetry: result.telemetry,
    };
  }
}
