import { z } from "zod";
import {
  normalizeResponseContent,
  normalizeUsage,
  returnedModel,
} from "@/lib/ai/normalization";
import type { Question } from "@/lib/domain/schemas";
import { getSimulatorConfig, type SimulatorProviderConfig } from "./config";
import {
  SimulatorAnswerSchema,
  SyntheticCallTelemetrySchema,
  SYNTHETIC_PROMPT_VERSION,
  type SimulatorAnswer,
  type SyntheticCallTelemetry,
  type SyntheticPersona,
} from "./schemas";

export type SimulatorHistoryItem = {
  question: string;
  choice: SimulatorAnswer["choice"];
  note: string | null;
};

export class SimulatorCallError extends Error {
  telemetry: SyntheticCallTelemetry;
  errorType: string;

  constructor(message: string, errorType: string, telemetry: SyntheticCallTelemetry) {
    super(message);
    this.name = "SimulatorCallError";
    this.errorType = errorType;
    this.telemetry = telemetry;
  }
}

function endpointFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function deterministicFraction(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

export function buildSimulatorPersonaView(persona: SyntheticPersona) {
  return {
    description: persona.description,
    everydayRules: persona.boundaryRules.map((item) => item.statement),
    nonNegotiables: persona.mustHaves.map((item) => item.statement),
    situationDependentRules: persona.conditionalRules.map((item) => item.statement),
    genuineUnknowns: persona.uncertainRegions.map((item) => item.statement),
    expressionStyle: persona.answerStyle.description,
    naturalPhrases: persona.answerStyle.preferredPhrases,
    unresolvedSelfConsistency:
      persona.contradictionMode === "INTENTIONAL_TRUE_CONTRADICTION"
        ? "你在少数议题上自己也没有整理出一致答案，不要为了显得完美而强行统一。"
        : "不同回答可以因授权、频率、期限或情境不同而变化。",
  };
}

export interface SyntheticUserSimulator {
  readonly config: SimulatorProviderConfig;
  answer(input: {
    persona: SyntheticPersona;
    question: Question;
    history: SimulatorHistoryItem[];
  }): Promise<{ answer: SimulatorAnswer; telemetry: SyntheticCallTelemetry }>;
}

function makeTelemetry(input: {
  config: SimulatorProviderConfig;
  raw?: unknown;
  latencyMs: number;
  success: boolean;
  errorType?: string;
}): SyntheticCallTelemetry {
  const usage = normalizeUsage(input.raw);
  return SyntheticCallTelemetrySchema.parse({
    id: `synthetic-telemetry-${crypto.randomUUID()}`,
    role: "USER_SIMULATOR",
    provider: input.config.providerName,
    requestedModel: input.config.model || "not-configured",
    returnedModel: returnedModel(input.raw),
    reasoningEffort: input.config.reasoningEffort,
    ...usage,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    success: input.success,
    errorType: input.errorType ?? null,
    timestamp: new Date().toISOString(),
  });
}

export class AIUserSimulator {
  readonly config: SimulatorProviderConfig;

  constructor(config = getSimulatorConfig()) {
    this.config = config;
  }

  async answer(input: {
    persona: SyntheticPersona;
    question: Question;
    history: SimulatorHistoryItem[];
  }): Promise<{ answer: SimulatorAnswer; telemetry: SyntheticCallTelemetry }> {
    const started = performance.now();
    let raw: unknown;
    const noteAllowed =
      deterministicFraction(`${input.persona.personaId}:${input.question.id}`) <
      input.persona.answerStyle.noteFrequency;

    if (!this.config.apiKey || !this.config.model) {
      const telemetry = makeTelemetry({
        config: this.config,
        latencyMs: performance.now() - started,
        success: false,
        errorType: "SIMULATOR_CONFIGURATION",
      });
      throw new SimulatorCallError(
        "Simulator API key and model are required.",
        "SIMULATOR_CONFIGURATION",
        telemetry,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: `你是 Relationship Boundary Map 的普通测试用户，不是分析师。根据隐藏生活设定回答当前一个问题。
只能输出 JSON：choice 只能是 ACCEPT、REJECT、DEPENDS、UNKNOWN；note 是短句或 null。
ACCEPT 只表示当前情境没有明确越过接受边界，不表示喜欢。
不要使用维度、Boundary Flip、Hidden Cost、Evidence、人格类型等产品术语。
不要解释思考过程，不要总结原则，不要猜测试目的。补充短句通常 5–30 个中文字符。
prompt_version=${SYNTHETIC_PROMPT_VERSION}
输出必须符合：${JSON.stringify(z.toJSONSchema(SimulatorAnswerSchema))}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              hidden_persona: buildSimulatorPersonaView(input.persona),
              current_question: {
                id: input.question.id,
                text: input.question.text,
                context: input.question.context ?? null,
                options: ["可以", "不可以", "看情况", "我不知道"],
              },
              note_policy: noteAllowed
                ? "可按自然表达需要写一句，也可以为 null"
                : "本题 note 必须为 null，只点按钮",
              recent_own_answers: input.history.slice(-3),
            }),
          },
        ],
        response_format:
          this.config.structuredOutputMode === "json_schema"
            ? {
                type: "json_schema",
                json_schema: {
                  name: "synthetic_user_answer",
                  strict: true,
                  schema: z.toJSONSchema(SimulatorAnswerSchema),
                },
              }
            : { type: "json_object" },
      };
      if (this.config.reasoningEffort) {
        body.reasoning_effort = this.config.reasoningEffort;
      }
      if (this.config.thinking) {
        body.thinking = { type: this.config.thinking };
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
        raw = text ? JSON.parse(text) : {};
      } catch {
        raw = { raw_text: text };
      }
      if (!response.ok) {
        throw new Error(`Simulator provider returned HTTP ${response.status}.`);
      }
      const parsed = SimulatorAnswerSchema.parse(normalizeResponseContent(raw));
      const answer = SimulatorAnswerSchema.parse({
        ...parsed,
        note: noteAllowed ? parsed.note : null,
      });
      return {
        answer,
        telemetry: makeTelemetry({
          config: this.config,
          raw,
          latencyMs: performance.now() - started,
          success: true,
        }),
      };
    } catch (error) {
      const errorType =
        error instanceof z.ZodError
          ? "SIMULATOR_SCHEMA_VALIDATION"
          : controller.signal.aborted
            ? "SIMULATOR_TIMEOUT"
            : "SIMULATOR_API_ERROR";
      const telemetry = makeTelemetry({
        config: this.config,
        raw,
        latencyMs: performance.now() - started,
        success: false,
        errorType,
      });
      throw new SimulatorCallError(
        error instanceof Error ? error.message : "Unknown simulator error.",
        errorType,
        telemetry,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
