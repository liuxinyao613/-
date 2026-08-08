import {
  AnswerInterpretationPayloadSchema,
  PlanProbeOutputSchema,
  WriteReportOutputSchema,
  type InterpretAnswerInput,
  type PlanProbeInput,
  type WriteReportInput,
} from "../contracts";
import { fallbackProbePlan } from "@/lib/adaptive/flow";
import {
  basicInterpretationPayload,
  normalizeInterpretation,
} from "../interpretation-policy";
import { makeTelemetry } from "../normalization";
import type { AIProvider } from "../provider";
import {
  AITelemetryRole,
  DiscomfortLevel,
  ExitSignal,
  SustainabilityLevel,
} from "@/lib/domain/schemas";
import { buildStructuredReport } from "@/lib/report/build-report";

export class MockProvider implements AIProvider {
  async interpretAnswer(input: InterpretAnswerInput) {
    const base = basicInterpretationPayload(input.response);
    const note = input.response.note;
    const conditions = /工作需要/.test(note)
      ? [{ variable: "work_necessity", statement: "仅限工作需要", consequence: "非工作需要时答案可能改变", confidence: 0.9 }]
      : /救急不救穷/.test(note)
        ? [{ variable: "emergency_vs_pattern", statement: "只接受短期救急，不接受长期重复承担", consequence: "从紧急事件变成持续模式时边界会翻转", confidence: 0.95 }]
        : base.conditions;
    const delayedExit = /放手|离开/.test(note);
    const payload = AnswerInterpretationPayloadSchema.parse({
      ...base,
      discomfort: /难受|痛苦|委屈|时间久了|慢慢放手/.test(note)
        ? DiscomfortLevel.HIGH
        : base.discomfort,
      sustainability: /时间久了|长期|慢慢放手|撑不住/.test(note)
        ? SustainabilityLevel.LOW
        : base.sustainability,
      conditional: base.conditional || conditions.length > 0,
      conditions,
      exitSignal: delayedExit ? ExitSignal.DELAYED_EXIT : base.exitSignal,
      requiresFollowup: base.requiresFollowup || conditions.length > 0 || delayedExit,
      followupReason: delayedExit
        ? "需要确认从承受到退出之间的期限和触发点。"
        : conditions.length > 0
          ? "需要验证条件改变时答案是否随之改变。"
          : base.followupReason,
      summary: note ? `补充短句显示：${note}` : base.summary,
      sourceQuote: note,
      confidence: note ? 0.85 : 1,
    });
    return {
      data: normalizeInterpretation(payload, input, `mock-interpretation-${input.response.id}`),
      telemetry: makeTelemetry({
        sessionId: input.response.sessionId,
        role: AITelemetryRole.ANSWER_INTERPRETER,
        provider: "mock",
        requestedModel: "mock",
        latencyMs: 0,
        success: true,
      }),
    };
  }

  async planProbe(input: PlanProbeInput) {
    const plan = fallbackProbePlan(input.session, input.facts);
    return {
      data: PlanProbeOutputSchema.parse(plan),
      telemetry: makeTelemetry({
        sessionId: input.session.id,
        role: AITelemetryRole.PROBE_PLANNER,
        provider: "mock",
        requestedModel: "mock",
        latencyMs: 0,
        success: true,
      }),
    };
  }

  generateQuestion(): Promise<never> {
    return Promise.reject(new Error("AI question generation is disabled in Phase 2."));
  }

  async writeReport(input: WriteReportInput) {
    return {
      data: WriteReportOutputSchema.parse({ report: buildStructuredReport(input.session, input.facts) }),
      telemetry: makeTelemetry({
        sessionId: input.session.id,
        role: AITelemetryRole.REPORT_WRITER,
        provider: "mock",
        requestedModel: "mock",
        latencyMs: 0,
        success: true,
      }),
    };
  }
}
