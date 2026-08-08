import { questionById } from "@/data/questions";
import {
  fallbackProbePlan,
  selectAdaptiveQuestions,
  shouldStopAdaptive,
} from "@/lib/adaptive/flow";
import { ProviderCallError, type AIProvider } from "@/lib/ai/provider";
import { shouldInterpretResponse } from "@/lib/ai/interpretation-policy";
import {
  AITelemetryRole,
  AnswerChoice,
  BoundaryDimension,
  type AITelemetry,
  type BoundaryState,
  type Session,
} from "@/lib/domain/schemas";
import { buildReportFacts, buildStructuredReport } from "@/lib/report/build-report";
import { sessionReducer } from "@/lib/session/reducer";
import {
  createSession,
  latestResponses,
  makeDirectEvidence,
  makeRawResponse,
} from "@/lib/session/session";
import { evaluateSyntheticSession } from "./evaluator";
import {
  SYNTHETIC_HARD_TOKEN_BUDGET,
  SYNTHETIC_SOFT_TOKEN_WARNING,
  getProductProvider,
  type ProductTarget,
} from "./config";
import {
  SimulatorCallError,
  type SimulatorHistoryItem,
  type SyntheticUserSimulator,
} from "./simulator";
import {
  SyntheticCallTelemetrySchema,
  SyntheticSessionMetricsSchema,
  SyntheticSessionResultSchema,
  SYNTHETIC_EVALUATOR_VERSION,
  SYNTHETIC_PROMPT_VERSION,
  type SimulatorAnswer,
  type SyntheticCallTelemetry,
  type SyntheticPersona,
  type SyntheticSessionMetrics,
  type SyntheticSessionResult,
} from "./schemas";

type SyntheticError = SyntheticSessionResult["errors"][number];
type TraceStep = SyntheticSessionResult["trace"][number];

const simulatorChoiceMap: Record<SimulatorAnswer["choice"], AnswerChoice> = {
  ACCEPT: AnswerChoice.CAN_ACCEPT,
  REJECT: AnswerChoice.CANNOT_ACCEPT,
  DEPENDS: AnswerChoice.DEPENDS,
  UNKNOWN: AnswerChoice.UNSURE,
};

function convertProductTelemetry(item: AITelemetry): SyntheticCallTelemetry {
  if (item.role === AITelemetryRole.QUESTION_GENERATOR) {
    throw new Error("QUESTION_GENERATOR must never run in Synthetic Phase 2 tests.");
  }
  return SyntheticCallTelemetrySchema.parse({
    ...item,
    role: item.role,
  });
}

function safeError(
  stage: SyntheticError["stage"],
  error: unknown,
  questionId?: string,
): SyntheticError {
  return {
    stage,
    type:
      error instanceof ProviderCallError
        ? error.errorType
        : error instanceof SimulatorCallError
          ? error.errorType
          : error instanceof Error
            ? error.name
            : "UNKNOWN_ERROR",
    message:
      error instanceof Error
        ? error.message.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
        : "Unknown synthetic harness error.",
    questionId,
    timestamp: new Date().toISOString(),
  };
}

function fallbackSimulatorAnswer(
  persona: SyntheticPersona,
  questionId: string,
  questionText: string,
  dimension: BoundaryDimension,
  index: number,
): SimulatorAnswer {
  const matching = persona.boundaryRules.find(
    (item) =>
      item.dimension === dimension &&
      item.keywords.some((keyword) => questionText.includes(keyword)),
  ) ?? persona.boundaryRules.find((item) => item.dimension === dimension);
  const expected = matching?.expectedChoice ??
    (persona.archetypes.includes("HIGH_UNKNOWN") && index % 4 === 0
      ? "UNKNOWN"
      : persona.archetypes.includes("CONDITIONAL") && index % 3 === 0
        ? "DEPENDS"
        : "ACCEPT");
  const phrase = persona.signaturePhrases.length
    ? persona.signaturePhrases[index % persona.signaturePhrases.length]
    : null;
  const noteThreshold = Math.abs(
    [...`${persona.personaId}:${questionId}`].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    ),
  ) % 100;
  return {
    choice: expected,
    note:
      phrase && noteThreshold < persona.answerStyle.noteFrequency * 100
        ? phrase.slice(0, 80)
        : null,
  };
}

function currentState(session: Session, dimension: BoundaryDimension): BoundaryState | undefined {
  return session.boundaryStates.find((item) => item.dimension === dimension);
}

function totalTokens(telemetry: SyntheticCallTelemetry[]): number {
  return telemetry.reduce((sum, item) => sum + item.totalTokens, 0);
}

function maxConsecutiveDimensions(session: Session): number {
  const responses = [...latestResponses(session.rawResponses).values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
  let maximum = 0;
  let current = 0;
  let previous: BoundaryDimension | undefined;
  for (const response of responses) {
    current = response.dimensionSnapshot === previous ? current + 1 : 1;
    previous = response.dimensionSnapshot;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function buildMetrics(input: {
  personaId: string;
  session: Session;
  telemetry: SyntheticCallTelemetry[];
  plannerFallbackCount: number;
  errors: SyntheticError[];
  stopReason: SyntheticSessionMetrics["stopReason"];
}): SyntheticSessionMetrics {
  const responses = [...latestResponses(input.session.rawResponses).values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const dimensionQuestionCounts = Object.fromEntries(
    Object.values(BoundaryDimension).map((dimension) => [
      dimension,
      responses.filter((item) => item.dimensionSnapshot === dimension).length,
    ]),
  );
  const extremityDistribution: Record<string, number> = {};
  responses.forEach((response) => {
    const question = questionById.get(response.questionId);
    const key = question?.stage === "CORE" ? "CORE" : String(question?.extremity ?? "UNKNOWN");
    extremityDistribution[key] = (extremityDistribution[key] ?? 0) + 1;
  });
  const roleCount = (role: SyntheticCallTelemetry["role"]) =>
    input.telemetry.filter((item) => item.role === role).length;

  return SyntheticSessionMetricsSchema.parse({
    personaId: input.personaId,
    totalQuestions: responses.length,
    coreQuestions: responses.filter((item) => item.stageSnapshot === "CORE").length,
    adaptiveQuestions: responses.filter((item) => item.stageSnapshot === "ADAPTIVE").length,
    totalAiCalls: input.telemetry.length,
    interpreterCalls: roleCount("ANSWER_INTERPRETER"),
    plannerCalls: roleCount("PROBE_PLANNER"),
    reportCalls: roleCount("REPORT_WRITER"),
    simulatorCalls: roleCount("USER_SIMULATOR"),
    inputTokens: input.telemetry.reduce((sum, item) => sum + item.inputTokens, 0),
    cachedInputTokens: input.telemetry.reduce(
      (sum, item) => sum + (item.cachedInputTokens ?? 0),
      0,
    ),
    outputTokens: input.telemetry.reduce((sum, item) => sum + item.outputTokens, 0),
    reasoningTokens: input.telemetry.reduce(
      (sum, item) => sum + (item.reasoningTokens ?? 0),
      0,
    ),
    totalTokens: totalTokens(input.telemetry),
    latencyMs: input.telemetry.reduce((sum, item) => sum + item.latencyMs, 0),
    dimensionQuestionCounts,
    maxConsecutiveSameDimension: maxConsecutiveDimensions(input.session),
    extremityDistribution,
    unknownCount: responses.filter((item) => item.answer === AnswerChoice.UNSURE).length,
    dependsCount: responses.filter((item) => item.answer === AnswerChoice.DEPENDS).length,
    notesCount: responses.filter((item) => item.note.length > 0).length,
    boundaryFlipCount: input.session.boundaryFlips.length,
    hiddenCostCount: input.session.hiddenCosts.length,
    plannerFallbackCount: input.plannerFallbackCount,
    schemaOrApiErrorCount: input.errors.filter((item) =>
      /API|SCHEMA|HTTP|TIMEOUT|CONFIGURATION|INVALID_JSON|NETWORK/.test(item.type),
    ).length,
    testCompleted:
      input.stopReason !== "TOKEN_BUDGET_EXCEEDED" &&
      input.stopReason !== "RUNNER_ERROR" &&
      responses.filter((item) => item.stageSnapshot === "ADAPTIVE").length >= 8,
    stopReason: input.stopReason,
  });
}

export async function runSyntheticSession(input: {
  runId: string;
  persona: SyntheticPersona;
  productTarget: ProductTarget;
  simulator: SyntheticUserSimulator;
  productOverride?: {
    provider: AIProvider;
    providerName: string;
    model: string;
  };
  onProgress?: (message: string) => void;
}): Promise<SyntheticSessionResult> {
  const startedAt = new Date().toISOString();
  const product = input.productOverride ?? getProductProvider(input.productTarget);
  const telemetry: SyntheticCallTelemetry[] = [];
  const errors: SyntheticError[] = [];
  const trace: TraceStep[] = [];
  const simulatorHistory: SimulatorHistoryItem[] = [];
  let session = createSession();
  let plannerFallbackCount = 0;
  let stopReason: SyntheticSessionMetrics["stopReason"] = "RUNNER_ERROR";
  let runnerFailed = false;

  try {
    while (session.status !== "COMPLETED") {
      if (totalTokens(telemetry) >= SYNTHETIC_HARD_TOKEN_BUDGET) {
        stopReason = "TOKEN_BUDGET_EXCEEDED";
        session = sessionReducer(session, {
          type: "COMPLETE_SESSION",
          at: new Date().toISOString(),
        });
        break;
      }

      if (session.currentIndex < session.questionOrder.length) {
        const questionId = session.questionOrder[session.currentIndex];
        const question = questionById.get(questionId);
        if (!question) throw new Error(`Unknown question in session order: ${questionId}`);
        input.onProgress?.(
          `${input.persona.personaId} ${input.productTarget} question ${session.currentIndex + 1}`,
        );
        const beforeState = currentState(session, question.dimension);
        let simulatorAnswer: SimulatorAnswer;
        let simulatorTelemetryId: string;
        try {
          const simulated = await input.simulator.answer({
            persona: input.persona,
            question,
            history: simulatorHistory,
          });
          simulatorAnswer = simulated.answer;
          telemetry.push(simulated.telemetry);
          simulatorTelemetryId = simulated.telemetry.id;
        } catch (error) {
          if (error instanceof SimulatorCallError) {
            telemetry.push(error.telemetry);
            simulatorTelemetryId = error.telemetry.id;
          } else {
            simulatorTelemetryId = `missing-simulator-telemetry-${crypto.randomUUID()}`;
          }
          errors.push(safeError("USER_SIMULATOR", error, question.id));
          simulatorAnswer = fallbackSimulatorAnswer(
            input.persona,
            question.id,
            question.text,
            question.dimension,
            session.currentIndex,
          );
        }

        const rawAnswer = simulatorChoiceMap[simulatorAnswer.choice];
        const rawResponse = makeRawResponse(
          session,
          question,
          rawAnswer,
          simulatorAnswer.note ?? "",
        );
        const evidenceBefore = new Set(session.evidence.map((item) => item.id));
        session = sessionReducer(session, {
          type: "RECORD_RESPONSE",
          response: rawResponse,
          evidence: makeDirectEvidence(rawResponse),
          nextIndex: session.currentIndex + 1,
        });
        simulatorHistory.push({
          question: question.text,
          choice: simulatorAnswer.choice,
          note: simulatorAnswer.note,
        });

        let interpretation: Extract<TraceStep, { kind: "ANSWER" }>["interpretation"];
        let interpreterTelemetryId: string | undefined;
        const interpreterCalled = shouldInterpretResponse(rawResponse);
        if (
          interpreterCalled &&
          totalTokens(telemetry) < SYNTHETIC_HARD_TOKEN_BUDGET
        ) {
          const facts = buildReportFacts(session);
          try {
            const result = await product.provider.interpretAnswer({
              question,
              response: rawResponse,
              relatedEvidence: session.evidence
                .filter(
                  (item) =>
                    item.dimension === question.dimension &&
                    item.rawResponseId !== rawResponse.id,
                )
                .slice(-8),
              knownRules: facts.knownRules
                .filter((item) => item.dimension === question.dimension)
                .slice(0, 6),
            });
            const converted = convertProductTelemetry(result.telemetry);
            telemetry.push(converted);
            interpreterTelemetryId = converted.id;
            interpretation = result.data;
            session = sessionReducer(session, {
              type: "ACCEPT_VALIDATED_INTERPRETATION",
              output: result.data,
              at: new Date().toISOString(),
            });
          } catch (error) {
            if (error instanceof ProviderCallError && error.telemetry) {
              const converted = convertProductTelemetry(error.telemetry);
              telemetry.push(converted);
              interpreterTelemetryId = converted.id;
            }
            errors.push(safeError("ANSWER_INTERPRETER", error, question.id));
          }
        }

        trace.push({
          kind: "ANSWER",
          index: rawResponse.sequence,
          question,
          simulatorAnswer,
          rawAnswer,
          rawResponseId: rawResponse.id,
          interpreterCalled,
          interpretation,
          newEvidenceIds: session.evidence
            .filter((item) => !evidenceBefore.has(item.id))
            .map((item) => item.id),
          boundaryStateBefore: beforeState,
          boundaryStateAfter: currentState(session, question.dimension),
          simulatorTelemetryId,
          interpreterTelemetryId,
        });

        if (totalTokens(telemetry) >= SYNTHETIC_HARD_TOKEN_BUDGET) {
          stopReason = "TOKEN_BUDGET_EXCEEDED";
          session = sessionReducer(session, {
            type: "COMPLETE_SESSION",
            at: new Date().toISOString(),
          });
        }
        continue;
      }

      const facts = buildReportFacts(session);
      let plan = fallbackProbePlan(session, facts);
      let usedFallback = false;
      let plannerTelemetryId: string | undefined;
      try {
        const result = await product.provider.planProbe({ session, facts });
        const converted = convertProductTelemetry(result.telemetry);
        telemetry.push(converted);
        plannerTelemetryId = converted.id;
        plan = result.data;
      } catch (error) {
        usedFallback = true;
        plannerFallbackCount += 1;
        if (error instanceof ProviderCallError && error.telemetry) {
          const converted = convertProductTelemetry(error.telemetry);
          telemetry.push(converted);
          plannerTelemetryId = converted.id;
        }
        errors.push(safeError("PROBE_PLANNER", error));
      }

      let selected = selectAdaptiveQuestions(session, plan.intents);
      if (
        selected.length === 0 &&
        session.rawResponses.filter((item) => item.stageSnapshot === "ADAPTIVE").length <
          session.adaptiveConfig.minAdaptive
      ) {
        usedFallback = true;
        plannerFallbackCount += 1;
        plan = fallbackProbePlan(session, facts);
        selected = selectAdaptiveQuestions(session, plan.intents);
      }

      trace.push({
        kind: "PLAN",
        afterQuestionCount: latestResponses(session.rawResponses).size,
        usedFallback,
        plannerStop: plan.stop,
        rationale: plan.rationale,
        intents: plan.intents,
        selectedQuestionIds: selected.map((item) => item.id),
        plannerTelemetryId,
      });

      const answeredTotal = latestResponses(session.rawResponses).size;
      if (shouldStopAdaptive(session, plan.stop, selected.length) || !selected.length) {
        stopReason =
          answeredTotal >= session.adaptiveConfig.hardLimit
            ? "HARD_QUESTION_LIMIT"
            : answeredTotal >= session.adaptiveConfig.targetTotal
              ? "TARGET_REACHED"
              : plan.stop
                ? "PLANNER_STOP"
                : "NO_HIGH_VALUE_PROBE";
        session = sessionReducer(session, {
          type: "COMPLETE_SESSION",
          at: new Date().toISOString(),
        });
      } else {
        session = sessionReducer(session, {
          type: "APPEND_PROBES",
          intents: plan.intents,
          questionIds: selected.map((item) => item.id),
          at: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    runnerFailed = true;
    stopReason = "RUNNER_ERROR";
    errors.push(safeError("RUNNER", error));
    if (session.status !== "COMPLETED") {
      session = sessionReducer(session, {
        type: "COMPLETE_SESSION",
        at: new Date().toISOString(),
      });
    }
  }

  let reportFacts = buildReportFacts(session);
  let structuredReport = buildStructuredReport(session, reportFacts);
  if (!runnerFailed && stopReason !== "TOKEN_BUDGET_EXCEEDED") {
    try {
      const result = await product.provider.writeReport({ session, facts: reportFacts });
      telemetry.push(convertProductTelemetry(result.telemetry));
      structuredReport = result.data.report;
      session = sessionReducer(session, {
        type: "SET_REPORT",
        report: structuredReport,
        status: "READY",
        at: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof ProviderCallError && error.telemetry) {
        telemetry.push(convertProductTelemetry(error.telemetry));
      }
      errors.push(safeError("REPORT_WRITER", error));
      session = sessionReducer(session, {
        type: "SET_REPORT",
        report: structuredReport,
        status: "FALLBACK",
        error: error instanceof Error ? error.message : "REPORT_WRITER_FAILED",
        at: new Date().toISOString(),
      });
    }
  } else {
    session = sessionReducer(session, {
      type: "SET_REPORT",
      report: structuredReport,
      status: "FALLBACK",
      error: stopReason,
      at: new Date().toISOString(),
    });
  }
  if (totalTokens(telemetry) >= SYNTHETIC_HARD_TOKEN_BUDGET) {
    stopReason = "TOKEN_BUDGET_EXCEEDED";
  }
  reportFacts = buildReportFacts(session);

  const metrics = buildMetrics({
    personaId: input.persona.personaId,
    session,
    telemetry,
    plannerFallbackCount,
    errors,
    stopReason,
  });
  const evaluated = evaluateSyntheticSession({
    persona: input.persona,
    session,
    report: structuredReport,
    trace,
    metrics,
  });
  const anomalies = [
    ...evaluated.anomalies,
    ...(metrics.totalTokens >= SYNTHETIC_SOFT_TOKEN_WARNING
      ? ["TOKEN_SOFT_WARNING"]
      : []),
    ...(errors.some((item) => item.stage === "USER_SIMULATOR")
      ? ["SIMULATOR_FALLBACK_USED"]
      : []),
  ];

  return SyntheticSessionResultSchema.parse({
    runId: input.runId,
    productTarget: input.productTarget,
    productProvider: product.providerName,
    productModel: product.model,
    simulatorProvider: input.simulator.config.providerName,
    simulatorModel: input.simulator.config.model || "not-configured",
    promptVersion: SYNTHETIC_PROMPT_VERSION,
    evaluatorVersion: SYNTHETIC_EVALUATOR_VERSION,
    persona: input.persona,
    trace,
    telemetry,
    errors,
    anomalies: [...new Set(anomalies)],
    metrics,
    session,
    reportFacts,
    structuredReport,
    evaluation: evaluated.evaluation,
    startedAt,
    completedAt: new Date().toISOString(),
  });
}
