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

const tendencyLabel: Record<
  "ACCEPT" | "REJECT" | "DEPENDS" | "UNKNOWN",
  string
> = {
  ACCEPT: "这个具体情境通常选择“可以”；这只表示没有明确越过接受边界。",
  REJECT: "这个具体情境通常选择“不可以”。",
  DEPENDS: "这个具体情境选择“看情况”，并只说明真正改变答案的条件。",
  UNKNOWN: "这个具体情境选择“我不知道”，不强行预设答案。",
};

function questionText(question: Question): string {
  return [question.text, question.context, ...question.variables].filter(Boolean).join(" ");
}

function keywordMatch(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function buildCurrentPersonaGuidance(
  persona: SyntheticPersona,
  question: Question,
) {
  const text = questionText(question);
  const sameDimensionRules = persona.boundaryRules.filter(
    (item) => item.dimension === question.dimension,
  );
  const exactRules = sameDimensionRules.filter((item) => keywordMatch(text, item.keywords));
  const selectedRules = exactRules.length ? exactRules : sameDimensionRules;
  const sameDimensionConditions = persona.conditionalRules.filter(
    (item) => item.dimension === question.dimension,
  );
  const exactConditions = sameDimensionConditions.filter((item) =>
    keywordMatch(text, item.keywords),
  );
  const sameDimensionUnknowns = persona.uncertainRegions.filter(
    (item) => item.dimension === question.dimension,
  );
  const exactUnknowns = sameDimensionUnknowns.filter((item) =>
    keywordMatch(text, item.keywords),
  );
  const hiddenReactions = persona.hiddenCostPatterns.filter(
    (item) =>
      item.dimension === question.dimension &&
      (keywordMatch(text, item.keywords) || selectedRules.length > 0),
  );
  const flipTriggers = persona.expectedFlips.filter(
    (item) =>
      item.dimension === question.dimension &&
      (keywordMatch(text, item.keywords) || selectedRules.length > 0),
  );
  const hasSpecificGuidance =
    selectedRules.length > 0 ||
    exactConditions.length > 0 ||
    exactUnknowns.length > 0;

  return {
    establishedRules: selectedRules.map((item) => ({
      situation: item.statement,
      responseTendency: tendencyLabel[item.expectedChoice ?? "ACCEPT"],
    })),
    decidingConditions: exactConditions.map((item) => item.statement),
    genuineUnknowns: exactUnknowns.map((item) => item.statement),
    possibleHiddenReactions: hiddenReactions.map((item) => item.statement),
    changeTriggers: flipTriggers.map((item) => item.trigger),
    defaultWhenUnspecified: hasSpecificGuidance
      ? "只按上面的当前相关规则回答，不要把 Persona 的整体风格泛化到别的情境。"
      : "隐藏设定没有把这个情境列为越界、条件题或未知区；通常选择“可以”，note 留空。",
    naturalPhrases: hasSpecificGuidance ? persona.signaturePhrases : [],
  };
}

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
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return (hash >>> 0) / 4_294_967_295;
}

export function buildSimulatorPersonaView(persona: SyntheticPersona) {
  return {
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

export class ReplayableSyntheticUserSimulator implements SyntheticUserSimulator {
  readonly config: SimulatorProviderConfig;
  private readonly cache = new Map<
    string,
    { answer: SimulatorAnswer; telemetry: SyntheticCallTelemetry }
  >();

  constructor(private readonly delegate: SyntheticUserSimulator) {
    this.config = delegate.config;
  }

  async answer(input: {
    persona: SyntheticPersona;
    question: Question;
    history: SimulatorHistoryItem[];
  }): Promise<{ answer: SimulatorAnswer; telemetry: SyntheticCallTelemetry }> {
    const key = `${input.persona.personaId}:${input.question.id}`;
    const cached = this.cache.get(key);
    if (cached) {
      return {
        answer: structuredClone(cached.answer),
        telemetry: SyntheticCallTelemetrySchema.parse({
          ...cached.telemetry,
          id: `synthetic-telemetry-${crypto.randomUUID()}`,
          timestamp: new Date().toISOString(),
        }),
      };
    }
    const result = await this.delegate.answer(input);
    this.cache.set(key, structuredClone(result));
    return result;
  }
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
    const currentGuidance = buildCurrentPersonaGuidance(
      input.persona,
      input.question,
    );
    const hasRelevantRule =
      currentGuidance.establishedRules.length > 0 ||
      currentGuidance.decidingConditions.length > 0 ||
      currentGuidance.genuineUnknowns.length > 0 ||
      currentGuidance.possibleHiddenReactions.length > 0;
    const noteAllowed =
      hasRelevantRule &&
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
只有 current_persona_guidance 明确给出条件时才选 DEPENDS；只有明确列为 genuine unknown 或 UNKNOWN tendency 时才选 UNKNOWN。
不要因为 Persona 整体上“条件多”“会忍耐”或“有未知”就把这种风格套到每一道题。
不要使用维度、Boundary Flip、Hidden Cost、Evidence、人格类型等产品术语。
不要解释思考过程，不要总结原则，不要猜测试目的。补充短句通常 5–30 个中文字符。
prompt_version=${SYNTHETIC_PROMPT_VERSION}
输出必须符合：${JSON.stringify(z.toJSONSchema(SimulatorAnswerSchema))}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              hidden_persona: buildSimulatorPersonaView(input.persona),
              current_persona_guidance: currentGuidance,
              current_question: {
                id: input.question.id,
                text: input.question.text,
                context: input.question.context ?? null,
                options: ["可以", "不可以", "看情况", "我不知道"],
              },
              note_policy: noteAllowed
                ? "本题必须写一句 5–30 个中文字符的自然补充；DEPENDS 要说关键条件，UNKNOWN 可说确实不知道，ACCEPT/REJECT 可说感受或原因"
                : "本题 note 必须为 null，只点按钮",
              recent_own_answers: input.history.slice(-2).map((item) => ({
                choice: item.choice,
                note: item.note,
              })),
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
        temperature: 0,
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
