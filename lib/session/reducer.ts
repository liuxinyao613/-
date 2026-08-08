import {
  InterpretAnswerOutputSchema,
  type InterpretAnswerOutput,
} from "@/lib/ai/contracts";
import { deriveBoundaryStates } from "@/lib/domain/derive";
import {
  AcceptanceSemantic,
  DiscomfortLevel,
  ExitSignal,
  SustainabilityLevel,
  type AITelemetry,
  type AnswerEvidence,
  type BoundaryFlip,
  type Condition,
  type HiddenCost,
  type ProbeIntent,
  type RawResponse,
  type Session,
  type StructuredReport,
} from "@/lib/domain/schemas";

export type SessionEvent =
  | { type: "HYDRATE"; session: Session }
  | { type: "RECORD_RESPONSE"; response: RawResponse; evidence: AnswerEvidence; nextIndex: number }
  | { type: "MOVE_TO"; index: number; at: string }
  | { type: "ACCEPT_VALIDATED_INTERPRETATION"; output: InterpretAnswerOutput; at: string }
  | { type: "APPEND_PROBES"; intents: ProbeIntent[]; questionIds: string[]; at: string }
  | { type: "ADD_TELEMETRY"; telemetry: AITelemetry }
  | { type: "COMPLETE_SESSION"; at: string }
  | { type: "REPORT_GENERATING"; at: string }
  | {
      type: "SET_REPORT";
      report: StructuredReport;
      status: "READY" | "FALLBACK";
      error?: string;
      at: string;
    };

function mergeUnique<T extends { id: string }>(existing: T[], additions: T[]): T[] {
  const merged = new Map(existing.map((item) => [item.id, item]));
  additions.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

function deriveInterpretationArtifacts(
  session: Session,
  output: InterpretAnswerOutput,
  at: string,
) {
  const response = session.rawResponses.find((item) => item.id === output.rawResponseId);
  if (!response) throw new Error("Interpretation references an unknown RawResponse.");
  const evidenceId = `evidence-${output.interpretationId}`;
  const semanticEvidence: AnswerEvidence = {
    id: evidenceId,
    rawResponseId: response.id,
    questionId: response.questionId,
    dimension: output.dimension,
    answer: response.answer,
    verbatimNote: response.note,
    kind: "AI_INTERPRETATION",
    supports: output.summary,
    createdAt: at,
    interpretationId: output.interpretationId,
    sourceQuote: output.sourceQuote,
    semantic: {
      acceptance: output.acceptance,
      discomfort: output.discomfort,
      sustainability: output.sustainability,
      conditional: output.conditional,
      relationshipStateChange: output.relationshipStateChange,
      exitSignal: output.exitSignal,
      principleHints: output.principleHints,
      semanticConflict: output.semanticConflict.present,
      requiresFollowup: output.requiresFollowup,
      followupReason: output.followupReason,
      confidence: output.confidence,
    },
  };
  const conditions: Condition[] = output.conditions.map((item, index) => ({
    id: `condition-${output.interpretationId}-${index}`,
    dimension: output.dimension,
    variable: item.variable,
    statement: item.statement,
    consequence: item.consequence,
    evidenceIds: [evidenceId],
    confidence: item.confidence,
    source: "AI_INFERENCE",
  }));
  const hiddenCosts: HiddenCost[] =
    [AcceptanceSemantic.ACCEPT, AcceptanceSemantic.DEPENDS].includes(output.acceptance) &&
    output.sustainability === SustainabilityLevel.LOW &&
    [DiscomfortLevel.MEDIUM, DiscomfortLevel.HIGH].includes(output.discomfort)
      ? [
          {
            id: `hidden-cost-${output.interpretationId}`,
            dimension: output.dimension,
            statement: output.summary,
            longTermRisk: "当前可接受与长期可持续之间存在距离，需要继续验证期限、消耗与退出条件。",
            evidenceIds: [evidenceId],
            confidence: output.confidence,
            status: "OBSERVED",
          },
        ]
      : [];
  const boundaryFlips: BoundaryFlip[] =
    output.exitSignal !== ExitSignal.NONE && output.exitSignal !== ExitSignal.UNKNOWN
      ? [
          {
            id: `flip-${output.interpretationId}`,
            dimension: output.dimension,
            from: output.acceptance === AcceptanceSemantic.DEPENDS ? "CONDITIONAL" : "ACCEPTABLE",
            to: "NOT_ACCEPTABLE",
            trigger: output.followupReason || output.summary,
            evidenceIds: [evidenceId],
            confidence: output.confidence,
          },
        ]
      : [];
  return { semanticEvidence, conditions, hiddenCosts, boundaryFlips };
}

export function sessionReducer(session: Session | null, event: SessionEvent): Session {
  if (event.type === "HYDRATE") return event.session;
  if (!session) throw new Error("Cannot apply a session event before hydration.");

  if (event.type === "RECORD_RESPONSE") {
    const evidence = [...session.evidence, event.evidence];
    const rawResponses = [...session.rawResponses, event.response];
    return {
      ...session,
      status: "IN_PROGRESS",
      phase: event.nextIndex < 24 ? "CORE" : "ADAPTIVE",
      currentIndex: event.nextIndex,
      rawResponses,
      evidence,
      boundaryStates: deriveBoundaryStates(rawResponses, evidence),
      structuredReport: undefined,
      reportStatus: "IDLE",
      reportError: undefined,
      updatedAt: event.response.submittedAt,
      completedAt: undefined,
    };
  }

  if (event.type === "MOVE_TO") {
    return {
      ...session,
      status: "IN_PROGRESS",
      phase: event.index < 24 ? "CORE" : "ADAPTIVE",
      currentIndex: Math.max(0, Math.min(event.index, session.questionOrder.length - 1)),
      updatedAt: event.at,
      completedAt: undefined,
    };
  }

  if (event.type === "ACCEPT_VALIDATED_INTERPRETATION") {
    const artifacts = deriveInterpretationArtifacts(session, event.output, event.at);
    const evidence = [...session.evidence, artifacts.semanticEvidence];
    return {
      ...session,
      evidence,
      conditions: mergeUnique(session.conditions, artifacts.conditions),
      hiddenCosts: mergeUnique(session.hiddenCosts, artifacts.hiddenCosts),
      boundaryFlips: mergeUnique(session.boundaryFlips, artifacts.boundaryFlips),
      boundaryStates: deriveBoundaryStates(session.rawResponses, evidence),
      acceptedInterpretations: [
        ...new Set([...session.acceptedInterpretations, event.output.interpretationId]),
      ],
      updatedAt: event.at,
    };
  }

  if (event.type === "APPEND_PROBES") {
    return {
      ...session,
      phase: "ADAPTIVE",
      questionOrder: [...new Set([...session.questionOrder, ...event.questionIds])],
      probeIntents: mergeUnique(session.probeIntents, event.intents),
      updatedAt: event.at,
    };
  }

  if (event.type === "ADD_TELEMETRY") {
    return {
      ...session,
      telemetry: mergeUnique(session.telemetry, [event.telemetry]),
      updatedAt: event.telemetry.timestamp,
    };
  }

  if (event.type === "COMPLETE_SESSION") {
    return {
      ...session,
      status: "COMPLETED",
      phase: "REPORT",
      currentIndex: Math.max(0, session.questionOrder.length - 1),
      completedAt: event.at,
      updatedAt: event.at,
    };
  }

  if (event.type === "REPORT_GENERATING") {
    return { ...session, reportStatus: "GENERATING", reportError: undefined, updatedAt: event.at };
  }

  return {
    ...session,
    structuredReport: event.report,
    reportStatus: event.status,
    reportError: event.error,
    updatedAt: event.at,
  };
}

export function createValidatedInterpretationEvent(
  rawProviderOutput: unknown,
  at = new Date().toISOString(),
): SessionEvent {
  return {
    type: "ACCEPT_VALIDATED_INTERPRETATION",
    output: InterpretAnswerOutputSchema.parse(rawProviderOutput),
    at,
  };
}
