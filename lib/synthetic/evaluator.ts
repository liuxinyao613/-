import {
  BoundaryPosition,
  ProbeType,
  type Session,
  type StructuredReport,
} from "@/lib/domain/schemas";
import { questionById } from "@/data/questions";
import {
  SyntheticEvaluationSchema,
  type SyntheticEvaluation,
  type SyntheticPersona,
  type SyntheticSessionMetrics,
  SyntheticTraceStepSchema,
} from "./schemas";
import type { z } from "zod";

type TraceStep = z.infer<typeof SyntheticTraceStepSchema>;

const forbiddenInference =
  /依恋类型|依恋型|童年|创伤|心理疾病|精神疾病|人格障碍|健康人格|不健康人格|你本质上|道德水平/;

function ratio(numerator: number, denominator: number): number {
  return denominator ? Math.max(0, Math.min(1, numerator / denominator)) : 1;
}

function rate(numerator: number, denominator: number): number {
  return denominator ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
}

function artifactText(
  item: { statement?: string; consequence?: string; trigger?: string; longTermRisk?: string; evidenceIds: string[] },
  session: Session,
): string {
  const notes = item.evidenceIds.flatMap((id) => {
    const evidence = session.evidence.find((candidate) => candidate.id === id);
    const response = evidence
      ? session.rawResponses.find((candidate) => candidate.id === evidence.rawResponseId)
      : undefined;
    return response?.note ? [response.note] : [];
  });
  return [item.statement, item.consequence, item.trigger, item.longTermRisk, ...notes]
    .filter(Boolean)
    .join(" ");
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function bigrams(text: string): Set<string> {
  const normalized = text.replace(/[\s，。；、？！“”]/g, "");
  const values = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    values.add(normalized.slice(index, index + 2));
  }
  return values;
}

function similarity(leftText: string, rightText: string): number {
  const left = bigrams(leftText);
  const right = bigrams(rightText);
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function reportConclusions(report: StructuredReport) {
  return [
    ...report.corePrinciples.map((item) => ({ text: `${item.title} ${item.description}`, evidenceIds: item.evidenceIds })),
    ...report.boundaryFlips.map((item) => ({ text: item.trigger, evidenceIds: item.evidenceIds })),
    ...report.mustHaves.map((item) => ({ text: item.statement, evidenceIds: item.evidenceIds })),
    ...report.hiddenCosts.map((item) => ({ text: `${item.statement} ${item.longTermRisk}`, evidenceIds: item.evidenceIds })),
    ...report.tensions.map((item) => ({ text: `${item.title} ${item.description}`, evidenceIds: item.evidenceIds })),
  ];
}

function groundTruthContradiction(persona: SyntheticPersona, session: Session): boolean {
  const states = new Map(session.boundaryStates.map((state) => [state.dimension, state]));
  const dimensions = new Set(persona.boundaryRules.map((rule) => rule.dimension));
  for (const dimension of dimensions) {
    const choices = new Set(
      persona.boundaryRules
        .filter((rule) => rule.dimension === dimension)
        .map((rule) => rule.expectedChoice),
    );
    const state = states.get(dimension);
    if (!state || choices.size !== 1) continue;
    if (
      choices.has("REJECT") &&
      state.position === BoundaryPosition.ACCEPTABLE_NO_CLEAR_CROSSING
    ) {
      return true;
    }
    if (
      choices.has("ACCEPT") &&
      state.position === BoundaryPosition.NOT_ACCEPTABLE
    ) {
      return true;
    }
    if (choices.has("UNKNOWN") && state.position !== BoundaryPosition.UNRESOLVED) {
      return true;
    }
  }
  return false;
}

export function evaluateSyntheticSession(input: {
  persona: SyntheticPersona;
  session: Session;
  report: StructuredReport;
  trace: TraceStep[];
  metrics: Pick<SyntheticSessionMetrics, "totalQuestions" | "totalTokens" | "maxConsecutiveSameDimension">;
}): { evaluation: SyntheticEvaluation; anomalies: string[] } {
  const { persona, session, report, trace } = input;
  const validEvidence = new Set(session.evidence.map((item) => item.id));

  const matchedConditionIds = persona.conditionalRules
    .filter((truth) =>
      session.conditions.some(
        (condition) =>
          condition.dimension === truth.dimension &&
          matchesKeywords(artifactText(condition, session), truth.keywords),
      ),
    )
    .map((item) => item.id);

  const matchedFlipIds = persona.expectedFlips
    .filter((truth) =>
      session.boundaryFlips.some(
        (candidate) =>
          candidate.dimension === truth.dimension &&
          matchesKeywords(artifactText(candidate, session), truth.keywords),
      ),
    )
    .map((item) => item.id);

  const falseFlipCount = session.boundaryFlips.filter(
    (candidate) =>
      !persona.expectedFlips.some((truth) => truth.dimension === candidate.dimension),
  ).length;

  const matchedHiddenCostIds = persona.hiddenCostPatterns
    .filter((truth) =>
      session.hiddenCosts.some(
        (candidate) =>
          candidate.dimension === truth.dimension &&
          matchesKeywords(artifactText(candidate, session), truth.keywords),
      ),
    )
    .map((item) => item.id);

  const respectedUncertaintyIds = persona.uncertainRegions
    .filter((truth) => {
      const state = session.boundaryStates.find(
        (candidate) => candidate.dimension === truth.dimension,
      );
      return state?.position === BoundaryPosition.UNRESOLVED && state.status === "UNCERTAIN";
    })
    .map((item) => item.id);

  const contradictionProbes = session.probeIntents.filter(
    (intent) => intent.probeType === ProbeType.CONTRADICTION_RESOLUTION,
  );
  const semanticConflicts = session.evidence.filter(
    (item) => item.semantic?.semanticConflict,
  );
  let contradictionHandling = 1;
  if (persona.contradictionMode === "SURFACE_ONLY") {
    contradictionHandling =
      contradictionProbes.length === 0 && semanticConflicts.length === 0 ? 1 : 0;
  } else if (persona.contradictionMode === "INTENTIONAL_TRUE_CONTRADICTION") {
    contradictionHandling = persona.trueContradictionDimensions.some(
      (dimension) =>
        contradictionProbes.some((intent) => intent.dimension === dimension) ||
        session.boundaryStates.some(
          (state) =>
            state.dimension === dimension && state.position === BoundaryPosition.MIXED,
        ),
    )
      ? 1
      : 0;
  }

  const planSteps = trace.filter(
    (step): step is Extract<TraceStep, { kind: "PLAN" }> => step.kind === "PLAN",
  );
  let relevantSelections = 0;
  let totalSelections = 0;
  for (const step of planSteps) {
    for (const questionId of step.selectedQuestionIds) {
      totalSelections += 1;
      const question = questionById.get(questionId);
      if (
        question &&
        step.intents.some(
          (intent) =>
            question.primaryDimension === intent.dimension ||
            question.secondaryDimensions.includes(intent.dimension) ||
            question.variables.includes(intent.targetVariable),
        )
      ) {
        relevantSelections += 1;
      }
    }
  }

  const adaptiveQuestions = session.questionOrder
    .map((id) => questionById.get(id))
    .filter((question) => question?.stage === "ADAPTIVE");
  let repeatedPairs = 0;
  for (let index = 1; index < adaptiveQuestions.length; index += 1) {
    if (
      adaptiveQuestions[index - 1] &&
      adaptiveQuestions[index] &&
      similarity(adaptiveQuestions[index - 1]!.text, adaptiveQuestions[index]!.text) >= 0.72
    ) {
      repeatedPairs += 1;
    }
  }
  const repetitionRate = rate(repeatedPairs, Math.max(0, adaptiveQuestions.length - 1));
  const highExtremityCount = adaptiveQuestions.filter(
    (question) => (question?.extremity ?? 0) >= 4,
  ).length;
  const extremityDrift = rate(highExtremityCount, adaptiveQuestions.length);

  const conclusions = reportConclusions(report);
  const ungrounded = conclusions.filter(
    (item) =>
      item.evidenceIds.length === 0 ||
      item.evidenceIds.some((id) => !validEvidence.has(id)),
  );
  const forbidden = conclusions.filter((item) => forbiddenInference.test(item.text));
  const overinterpretationCount = new Set([...ungrounded, ...forbidden]).size;
  const evidenceGrounding = ratio(conclusions.length - ungrounded.length, conclusions.length);

  const evaluation = SyntheticEvaluationSchema.parse({
    conditionRecall: ratio(matchedConditionIds.length, persona.conditionalRules.length),
    boundaryFlipRecall: ratio(matchedFlipIds.length, persona.expectedFlips.length),
    falseFlipRate: rate(falseFlipCount, session.boundaryFlips.length),
    hiddenCostRecall: ratio(matchedHiddenCostIds.length, persona.hiddenCostPatterns.length),
    uncertaintyRespect: ratio(
      respectedUncertaintyIds.length,
      persona.uncertainRegions.length,
    ),
    contradictionHandling,
    adaptiveRelevance: rate(relevantSelections, totalSelections),
    repetitionRate,
    extremityDrift,
    overinterpretationRate: rate(overinterpretationCount, conclusions.length),
    evidenceGrounding,
    matchedConditionIds,
    matchedFlipIds,
    matchedHiddenCostIds,
    respectedUncertaintyIds,
    errorCases: [
      ...(matchedConditionIds.length < persona.conditionalRules.length
        ? ["关键条件未完全识别"]
        : []),
      ...(matchedFlipIds.length < persona.expectedFlips.length
        ? ["预设 Boundary Flip 未完全发现"]
        : []),
      ...(matchedHiddenCostIds.length < persona.hiddenCostPatterns.length
        ? ["Hidden Cost 未完全识别"]
        : []),
      ...(respectedUncertaintyIds.length < persona.uncertainRegions.length
        ? ["真实 UNKNOWN 未完全保留"]
        : []),
      ...(contradictionHandling < 1 ? ["表面/真实矛盾处理不符合 Ground Truth"] : []),
      ...(ungrounded.length ? ["报告存在无效或缺失 Evidence 引用"] : []),
      ...(forbidden.length ? ["报告出现禁止的心理或人格推断"] : []),
      ...(groundTruthContradiction(persona, session)
        ? ["最终状态与明确 Ground Truth 方向相反"]
        : []),
    ],
  });

  const uncertainDimensions = new Set(
    persona.uncertainRegions.map((item) => item.dimension),
  );
  const repeatedUnknownProbes = session.rawResponses.filter(
    (response) =>
      response.stageSnapshot === "ADAPTIVE" &&
      uncertainDimensions.has(response.dimensionSnapshot),
  ).length;
  const anomalies = [
    ...(input.metrics.totalQuestions > 45 ? ["QUESTION_SOFT_LIMIT_EXCEEDED"] : []),
    ...(input.metrics.totalQuestions >= 50 ? ["QUESTION_HARD_LIMIT_REACHED"] : []),
    ...(input.metrics.maxConsecutiveSameDimension > 2
      ? ["DIMENSION_COOLDOWN_VIOLATION"]
      : []),
    ...(repetitionRate >= 0.25 ? ["SEMANTIC_REPETITION"] : []),
    ...(extremityDrift >= 0.2 ? ["EXTREMITY_DRIFT"] : []),
    ...(repeatedUnknownProbes > 3 ? ["UNKNOWN_OVERPROBED"] : []),
    ...(ungrounded.length ? ["REPORT_UNGROUNDED_CONCLUSION"] : []),
    ...(forbidden.length ? ["FORBIDDEN_REPORT_INFERENCE"] : []),
    ...(matchedFlipIds.length < persona.expectedFlips.length
      ? ["EXPECTED_FLIP_MISSED"]
      : []),
    ...(groundTruthContradiction(persona, session)
      ? ["GROUND_TRUTH_REPORT_CONTRADICTION"]
      : []),
    ...(input.metrics.totalTokens > 150_000 ? ["TOKEN_BUDGET_EXCEEDED"] : []),
  ];

  return { evaluation, anomalies: [...new Set(anomalies)] };
}
