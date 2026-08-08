import { z } from "zod";
import {
  AITelemetrySchema,
  AnswerChoiceSchema,
  BoundaryDimensionSchema,
  BoundaryStateSchema,
  ProbeIntentSchema,
  QuestionSchema,
  ReportFactsSchema,
  SessionSchema,
  StructuredReportSchema,
} from "@/lib/domain/schemas";
import { InterpretAnswerOutputSchema } from "@/lib/ai/contracts";

export const SYNTHETIC_PROMPT_VERSION = "synthetic-user-v2";
export const SYNTHETIC_EVALUATOR_VERSION = "deterministic-evaluator-v1";
export const SYNTHETIC_QUESTION_BANK_VERSION = "core24-adaptive44-v1";

export const PersonaArchetypeSchema = z.enum([
  "CLEAR_RULES",
  "CONDITIONAL",
  "HIDDEN_COST",
  "HIGH_UNKNOWN",
  "SURFACE_CONSISTENT",
  "TRUE_CONTRADICTION",
  "MINIMALIST",
  "COLLOQUIAL_ZH",
]);

export const ContradictionModeSchema = z.enum([
  "CONSISTENT",
  "SURFACE_ONLY",
  "INTENTIONAL_TRUE_CONTRADICTION",
]);

const GroundTruthRuleSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  statement: z.string().min(1),
  expectedChoice: z.enum(["ACCEPT", "REJECT", "DEPENDS", "UNKNOWN"]).optional(),
  keywords: z.array(z.string().min(1)).min(1),
});

const GroundTruthFlipSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  trigger: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});

const GroundTruthPatternSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  statement: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});

export const SyntheticPersonaSchema = z.object({
  personaId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  archetypes: z.array(PersonaArchetypeSchema).min(1),
  boundaryRules: z.array(GroundTruthRuleSchema).min(3),
  mustHaves: z.array(GroundTruthRuleSchema).min(1),
  conditionalRules: z.array(GroundTruthRuleSchema),
  expectedFlips: z.array(GroundTruthFlipSchema),
  hiddenCostPatterns: z.array(GroundTruthPatternSchema),
  uncertainRegions: z.array(GroundTruthPatternSchema),
  answerStyle: z.object({
    description: z.string().min(1),
    preferredPhrases: z.array(z.string().min(1)),
    noteFrequency: z.number().min(0).max(1),
  }),
  contradictionMode: ContradictionModeSchema,
  trueContradictionDimensions: z.array(BoundaryDimensionSchema).default([]),
  signaturePhrases: z.array(z.string().min(1)).default([]),
});

export type SyntheticPersona = z.infer<typeof SyntheticPersonaSchema>;

export const SimulatorChoiceSchema = z.enum(["ACCEPT", "REJECT", "DEPENDS", "UNKNOWN"]);
export const SimulatorAnswerSchema = z.object({
  choice: SimulatorChoiceSchema,
  note: z.string().max(80).nullable(),
});
export type SimulatorAnswer = z.infer<typeof SimulatorAnswerSchema>;

export const SyntheticCallRoleSchema = z.enum([
  "USER_SIMULATOR",
  "ANSWER_INTERPRETER",
  "PROBE_PLANNER",
  "REPORT_WRITER",
]);

export const SyntheticCallTelemetrySchema = z.object({
  id: z.string().min(1),
  role: SyntheticCallRoleSchema,
  provider: z.string().min(1),
  requestedModel: z.string().min(1),
  returnedModel: z.string().nullable(),
  reasoningEffort: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  success: z.boolean(),
  errorType: z.string().nullable(),
  timestamp: z.string().datetime(),
});

export type SyntheticCallTelemetry = z.infer<typeof SyntheticCallTelemetrySchema>;

export const SyntheticErrorSchema = z.object({
  stage: SyntheticCallRoleSchema.or(z.enum(["RUNNER", "EVALUATOR"])),
  type: z.string().min(1),
  message: z.string().min(1),
  questionId: z.string().optional(),
  timestamp: z.string().datetime(),
});

export const AnswerTraceStepSchema = z.object({
  kind: z.literal("ANSWER"),
  index: z.number().int().nonnegative(),
  question: QuestionSchema,
  simulatorAnswer: SimulatorAnswerSchema,
  rawAnswer: AnswerChoiceSchema,
  rawResponseId: z.string().min(1),
  interpreterCalled: z.boolean(),
  interpretation: InterpretAnswerOutputSchema.optional(),
  newEvidenceIds: z.array(z.string()),
  boundaryStateBefore: BoundaryStateSchema.optional(),
  boundaryStateAfter: BoundaryStateSchema.optional(),
  simulatorTelemetryId: z.string().min(1),
  interpreterTelemetryId: z.string().optional(),
});

export const PlanTraceStepSchema = z.object({
  kind: z.literal("PLAN"),
  afterQuestionCount: z.number().int().nonnegative(),
  usedFallback: z.boolean(),
  plannerStop: z.boolean(),
  rationale: z.string(),
  intents: z.array(ProbeIntentSchema),
  selectedQuestionIds: z.array(z.string()),
  plannerTelemetryId: z.string().optional(),
});

export const SyntheticTraceStepSchema = z.discriminatedUnion("kind", [
  AnswerTraceStepSchema,
  PlanTraceStepSchema,
]);

export const SyntheticEvaluationSchema = z.object({
  conditionRecall: z.number().min(0).max(1),
  boundaryFlipRecall: z.number().min(0).max(1),
  falseFlipRate: z.number().min(0).max(1),
  hiddenCostRecall: z.number().min(0).max(1),
  uncertaintyRespect: z.number().min(0).max(1),
  contradictionHandling: z.number().min(0).max(1),
  adaptiveRelevance: z.number().min(0).max(1),
  repetitionRate: z.number().min(0).max(1),
  extremityDrift: z.number().min(0).max(1),
  overinterpretationRate: z.number().min(0).max(1),
  evidenceGrounding: z.number().min(0).max(1),
  matchedConditionIds: z.array(z.string()),
  matchedFlipIds: z.array(z.string()),
  matchedHiddenCostIds: z.array(z.string()),
  respectedUncertaintyIds: z.array(z.string()),
  errorCases: z.array(z.string()),
});

export type SyntheticEvaluation = z.infer<typeof SyntheticEvaluationSchema>;

export const SyntheticSessionMetricsSchema = z.object({
  personaId: z.string().min(1),
  totalQuestions: z.number().int().nonnegative(),
  coreQuestions: z.number().int().nonnegative(),
  adaptiveQuestions: z.number().int().nonnegative(),
  totalAiCalls: z.number().int().nonnegative(),
  interpreterCalls: z.number().int().nonnegative(),
  plannerCalls: z.number().int().nonnegative(),
  reportCalls: z.number().int().nonnegative(),
  simulatorCalls: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  dimensionQuestionCounts: z.record(BoundaryDimensionSchema, z.number().int().nonnegative()),
  maxConsecutiveSameDimension: z.number().int().nonnegative(),
  extremityDistribution: z.record(z.string(), z.number().int().nonnegative()),
  unknownCount: z.number().int().nonnegative(),
  dependsCount: z.number().int().nonnegative(),
  notesCount: z.number().int().nonnegative(),
  boundaryFlipCount: z.number().int().nonnegative(),
  hiddenCostCount: z.number().int().nonnegative(),
  plannerFallbackCount: z.number().int().nonnegative(),
  schemaOrApiErrorCount: z.number().int().nonnegative(),
  testCompleted: z.boolean(),
  stopReason: z.enum([
    "PLANNER_STOP",
    "TARGET_REACHED",
    "NO_HIGH_VALUE_PROBE",
    "HARD_QUESTION_LIMIT",
    "TOKEN_BUDGET_EXCEEDED",
    "RUNNER_ERROR",
  ]),
});

export type SyntheticSessionMetrics = z.infer<typeof SyntheticSessionMetricsSchema>;

export const SyntheticSessionResultSchema = z.object({
  runId: z.string().min(1),
  productTarget: z.enum(["sol", "deepseek"]),
  productProvider: z.string().min(1),
  productModel: z.string().min(1),
  simulatorProvider: z.string().min(1),
  simulatorModel: z.string().min(1),
  promptVersion: z.enum(["synthetic-user-v1", "synthetic-user-v2"]),
  productPromptVersion: z.string().min(1).default("phase2-ai-v1"),
  evaluatorVersion: z.literal(SYNTHETIC_EVALUATOR_VERSION),
  questionBankVersion: z
    .literal(SYNTHETIC_QUESTION_BANK_VERSION)
    .default(SYNTHETIC_QUESTION_BANK_VERSION),
  persona: SyntheticPersonaSchema,
  trace: z.array(SyntheticTraceStepSchema),
  telemetry: z.array(SyntheticCallTelemetrySchema),
  errors: z.array(SyntheticErrorSchema),
  anomalies: z.array(z.string()),
  metrics: SyntheticSessionMetricsSchema,
  session: SessionSchema,
  reportFacts: ReportFactsSchema,
  structuredReport: StructuredReportSchema,
  evaluation: SyntheticEvaluationSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export type SyntheticSessionResult = z.infer<typeof SyntheticSessionResultSchema>;

export const SyntheticRunSummarySchema = z.object({
  runId: z.string().min(1),
  mode: z.enum(["smoke", "standard", "stress", "ab"]),
  productTarget: z.enum(["sol", "deepseek", "comparison"]),
  promptVersion: z.enum(["synthetic-user-v1", "synthetic-user-v2"]),
  productPromptVersion: z.string().min(1).default("phase2-ai-v1"),
  evaluatorVersion: z.literal(SYNTHETIC_EVALUATOR_VERSION),
  questionBankVersion: z
    .literal(SYNTHETIC_QUESTION_BANK_VERSION)
    .default(SYNTHETIC_QUESTION_BANK_VERSION),
  personaIds: z.array(z.string()),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  concurrency: z.number().int().positive(),
  targetTotal: z.number().int().min(24).max(50).default(38),
  completionRate: z.number().min(0).max(1),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  averages: z.record(z.string(), z.number()),
  percentiles: z.record(z.string(), z.number()),
  aggregateEvaluation: SyntheticEvaluationSchema.pick({
    conditionRecall: true,
    boundaryFlipRecall: true,
    falseFlipRate: true,
    hiddenCostRecall: true,
    uncertaintyRespect: true,
    contradictionHandling: true,
    adaptiveRelevance: true,
    repetitionRate: true,
    extremityDrift: true,
    overinterpretationRate: true,
    evidenceGrounding: true,
  }),
  averageDimensionQuestionCounts: z.record(
    BoundaryDimensionSchema,
    z.number().nonnegative(),
  ),
  mostOverprobedDimension: BoundaryDimensionSchema.nullable(),
  mostUnresolvedDimension: BoundaryDimensionSchema.nullable(),
  mostSelectedAdaptiveQuestion: z.string().nullable(),
  neverSelectedQuestionIds: z.array(z.string()),
  reachedSoftLimitRate: z.number().min(0).max(1),
  reachedHardLimitRate: z.number().min(0).max(1),
  plannerFallbackCount: z.number().int().nonnegative(),
  schemaOrApiErrorRate: z.number().min(0).max(1),
  anomalyCount: z.number().int().nonnegative(),
  bestSessionIds: z.array(z.string()),
  reviewSessionIds: z.array(z.string()),
});

export type SyntheticRunSummary = z.infer<typeof SyntheticRunSummarySchema>;

export type ProductTelemetry = z.infer<typeof AITelemetrySchema>;
