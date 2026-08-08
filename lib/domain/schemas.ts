import { z } from "zod";

export enum BoundaryDimension {
  AUTONOMY_CONTROL = "AUTONOMY_CONTROL",
  HONESTY_AUTHENTICITY = "HONESTY_AUTHENTICITY",
  PRIVACY_PERSONAL_SPACE = "PRIVACY_PERSONAL_SPACE",
  LOYALTY_EXCLUSIVITY = "LOYALTY_EXCLUSIVITY",
  RELATIONSHIP_PRIORITY = "RELATIONSHIP_PRIORITY",
  SACRIFICE_SHARED_BURDEN = "SACRIFICE_SHARED_BURDEN",
  CONFLICT_DIGNITY = "CONFLICT_DIGNITY",
  RESPONSIBILITY_FAIRNESS = "RESPONSIBILITY_FAIRNESS",
  FORGIVENESS_REPAIR_TRUST = "FORGIVENESS_REPAIR_TRUST",
  COMMITMENT_FUTURE_STRUCTURE = "COMMITMENT_FUTURE_STRUCTURE",
  EMOTIONAL_INTIMACY_NEEDS = "EMOTIONAL_INTIMACY_NEEDS",
}

export const BoundaryDimensionSchema = z.nativeEnum(BoundaryDimension);

export enum AnswerChoice {
  CAN_ACCEPT = "CAN_ACCEPT",
  CANNOT_ACCEPT = "CANNOT_ACCEPT",
  DEPENDS = "DEPENDS",
  UNSURE = "UNSURE",
  SKIPPED = "SKIPPED",
}

export const AnswerChoiceSchema = z.nativeEnum(AnswerChoice);

export enum AcceptanceSemantic {
  ACCEPT = "ACCEPT",
  REJECT = "REJECT",
  DEPENDS = "DEPENDS",
  UNKNOWN = "UNKNOWN",
  SKIPPED = "SKIPPED",
}

export enum DiscomfortLevel {
  NONE = "NONE",
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  UNKNOWN = "UNKNOWN",
}

export enum SustainabilityLevel {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  UNKNOWN = "UNKNOWN",
}

export enum RelationshipStateChange {
  NONE = "NONE",
  DISTANCING = "DISTANCING",
  RENEGOTIATE = "RENEGOTIATE",
  PAUSE = "PAUSE",
  END_RELATIONSHIP = "END_RELATIONSHIP",
  UNKNOWN = "UNKNOWN",
}

export enum ExitSignal {
  NONE = "NONE",
  IMMEDIATE_EXIT = "IMMEDIATE_EXIT",
  DELAYED_EXIT = "DELAYED_EXIT",
  CONDITIONAL_EXIT = "CONDITIONAL_EXIT",
  UNKNOWN = "UNKNOWN",
}

export enum ProbeType {
  CONDITION_CLARIFICATION = "CONDITION_CLARIFICATION",
  BOUNDARY_LADDER = "BOUNDARY_LADDER",
  SINGLE_VARIABLE = "SINGLE_VARIABLE",
  CROSS_CONTEXT_VALIDATION = "CROSS_CONTEXT_VALIDATION",
  CONTRADICTION_RESOLUTION = "CONTRADICTION_RESOLUTION",
  HIDDEN_COST_PROBE = "HIDDEN_COST_PROBE",
  UNCERTAINTY_PROBE = "UNCERTAINTY_PROBE",
}

export const ProbeIntentSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  probeType: z.nativeEnum(ProbeType),
  targetVariable: z.string().min(1),
  informationGoal: z.string().min(1),
  fixedVariables: z.array(z.string()),
  desiredChange: z.string().min(1),
  preferredTags: z.array(z.string()),
  desiredExtremity: z.number().int().min(1).max(5),
  priority: z.number().min(0).max(1),
});

export type ProbeIntent = z.infer<typeof ProbeIntentSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  stage: z.enum(["CORE", "ADAPTIVE"]),
  order: z.number().int().nonnegative(),
  dimension: BoundaryDimensionSchema,
  text: z.string().min(1),
  context: z.string().optional(),
  probeIntent: ProbeIntentSchema.optional(),
  source: z.enum(["FIXED_CORE", "MOCK_ADAPTIVE", "QUESTION_BANK", "AI_GENERATED"]),
  core: z.boolean().default(false),
  primaryDimension: BoundaryDimensionSchema.optional(),
  secondaryDimensions: z.array(BoundaryDimensionSchema).default([]),
  scenarioTags: z.array(z.string()).default([]),
  variables: z.array(z.string()).default([]),
  extremity: z.number().int().min(1).max(5).optional(),
  semanticKey: z.string().optional(),
});

export const AdaptiveQuestionBankItemSchema = QuestionSchema.extend({
  stage: z.literal("ADAPTIVE"),
  source: z.literal("QUESTION_BANK"),
  core: z.literal(false),
  primaryDimension: BoundaryDimensionSchema,
  extremity: z.number().int().min(1).max(5),
});

export type Question = z.infer<typeof QuestionSchema>;
export type AdaptiveQuestionBankItem = z.infer<typeof AdaptiveQuestionBankItemSchema>;

export const RawResponseSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  questionVersion: z.number().int().positive(),
  questionTextSnapshot: z.string().min(1),
  dimensionSnapshot: BoundaryDimensionSchema,
  stageSnapshot: z.enum(["CORE", "ADAPTIVE"]),
  answer: AnswerChoiceSchema,
  note: z.string().max(280),
  submittedAt: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
  supersedesResponseId: z.string().optional(),
});

export type RawResponse = z.infer<typeof RawResponseSchema>;

export const EvidenceSemanticSchema = z.object({
  acceptance: z.nativeEnum(AcceptanceSemantic),
  discomfort: z.nativeEnum(DiscomfortLevel),
  sustainability: z.nativeEnum(SustainabilityLevel),
  conditional: z.boolean(),
  relationshipStateChange: z.nativeEnum(RelationshipStateChange),
  exitSignal: z.nativeEnum(ExitSignal),
  principleHints: z.array(z.string()),
  semanticConflict: z.boolean(),
  requiresFollowup: z.boolean(),
  followupReason: z.string(),
  confidence: z.number().min(0).max(1),
});

export const AnswerEvidenceSchema = z.object({
  id: z.string().min(1),
  rawResponseId: z.string().min(1),
  questionId: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  answer: AnswerChoiceSchema,
  verbatimNote: z.string().max(280),
  kind: z.enum(["DIRECT_ANSWER", "USER_TEXT", "AI_INTERPRETATION"]),
  supports: z.string().min(1),
  createdAt: z.string().datetime(),
  interpretationId: z.string().optional(),
  sourceQuote: z.string().optional(),
  semantic: EvidenceSemanticSchema.optional(),
});

export type AnswerEvidence = z.infer<typeof AnswerEvidenceSchema>;

export const ConditionSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  variable: z.string().default("unspecified"),
  statement: z.string().min(1),
  consequence: z.string().min(1),
  evidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  source: z.enum(["USER_EXPLICIT", "MOCK_INFERENCE", "AI_INFERENCE"]),
});

export type Condition = z.infer<typeof ConditionSchema>;

export const BoundaryFlipSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  from: z.enum(["ACCEPTABLE", "CONDITIONAL", "NOT_ACCEPTABLE", "UNRESOLVED"]),
  to: z.enum(["ACCEPTABLE", "CONDITIONAL", "NOT_ACCEPTABLE", "UNRESOLVED"]),
  trigger: z.string().min(1),
  evidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type BoundaryFlip = z.infer<typeof BoundaryFlipSchema>;

export const HiddenCostSchema = z.object({
  id: z.string().min(1),
  dimension: BoundaryDimensionSchema,
  statement: z.string().min(1),
  longTermRisk: z.string().min(1),
  evidenceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  status: z.enum(["OBSERVED", "TO_VALIDATE"]),
});

export type HiddenCost = z.infer<typeof HiddenCostSchema>;

export enum BoundaryPosition {
  ACCEPTABLE_NO_CLEAR_CROSSING = "ACCEPTABLE_NO_CLEAR_CROSSING",
  CONDITIONAL = "CONDITIONAL",
  NOT_ACCEPTABLE = "NOT_ACCEPTABLE",
  UNRESOLVED = "UNRESOLVED",
  MIXED = "MIXED",
}

export const BoundaryStateSchema = z.object({
  dimension: BoundaryDimensionSchema,
  position: z.nativeEnum(BoundaryPosition),
  label: z.string().min(1),
  summary: z.string().min(1),
  evidenceIds: z.array(z.string()),
  answerCounts: z.object({
    canAccept: z.number().int().nonnegative(),
    cannotAccept: z.number().int().nonnegative(),
    depends: z.number().int().nonnegative(),
    unsure: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  confidence: z.number().min(0).max(1).default(0),
  status: z.enum(["STABLE", "NEEDS_PROBE", "UNCERTAIN"]).default("NEEDS_PROBE"),
});

export type BoundaryState = z.infer<typeof BoundaryStateSchema>;

export enum AITelemetryRole {
  ANSWER_INTERPRETER = "ANSWER_INTERPRETER",
  PROBE_PLANNER = "PROBE_PLANNER",
  REPORT_WRITER = "REPORT_WRITER",
  QUESTION_GENERATOR = "QUESTION_GENERATOR",
}

export const AITelemetrySchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.nativeEnum(AITelemetryRole),
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

export type AITelemetry = z.infer<typeof AITelemetrySchema>;

export const SessionQualitySchema = z.object({
  answeredQuestions: z.number().int().nonnegative(),
  skippedQuestions: z.number().int().nonnegative(),
  noteCount: z.number().int().nonnegative(),
  interpretedAnswers: z.number().int().nonnegative(),
  evidenceCoverage: z.number().min(0).max(1),
});

export const KnownRuleSchema = z.object({
  dimension: BoundaryDimensionSchema,
  statement: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
  confidence: z.number().min(0).max(1),
});

export const DimensionFactSchema = z.object({
  dimension: BoundaryDimensionSchema,
  state: BoundaryStateSchema,
  conditions: z.array(ConditionSchema),
  hiddenCosts: z.array(HiddenCostSchema),
  principleHints: z.array(z.string()),
  evidenceIds: z.array(z.string()),
});

export const ReportFactsSchema = z.object({
  sessionId: z.string().min(1),
  generatedAt: z.string().datetime(),
  sessionQuality: SessionQualitySchema,
  dimensionFacts: z.array(DimensionFactSchema),
  boundaryStates: z.array(BoundaryStateSchema),
  conditions: z.array(ConditionSchema),
  boundaryFlips: z.array(BoundaryFlipSchema),
  hiddenCosts: z.array(HiddenCostSchema),
  mustHaves: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      statement: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  knownRules: z.array(KnownRuleSchema),
  crossDimensionPatterns: z.array(
    z.object({
      statement: z.string().min(1),
      dimensions: z.array(BoundaryDimensionSchema).min(2),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  uncertainties: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      statement: z.string().min(1),
      evidenceIds: z.array(z.string()),
    }),
  ),
  selectedUserNotes: z.array(
    z.object({
      rawResponseId: z.string().min(1),
      dimension: BoundaryDimensionSchema,
      note: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  unresolvedDimensions: z.array(BoundaryDimensionSchema),
  evidence: z.array(AnswerEvidenceSchema),
});

export type ReportFacts = z.infer<typeof ReportFactsSchema>;

export const ReportTensionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
});

export const StructuredReportSchema = z.object({
  reportVersion: z.literal(2),
  generatedBy: z.enum(["AI", "FALLBACK"]),
  title: z.string().min(1),
  headline: z.string().min(1),
  snapshot: z.string().min(1),
  overview: z.string().min(1),
  corePrinciples: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      dimension: BoundaryDimensionSchema,
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  dimensionMap: z.array(BoundaryStateSchema),
  boundaryFlips: z.array(BoundaryFlipSchema),
  mustHaves: ReportFactsSchema.shape.mustHaves,
  hiddenCosts: z.array(HiddenCostSchema),
  tensions: z.array(ReportTensionSchema),
  unresolvedAreas: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      prompt: z.string().min(1),
      evidenceIds: z.array(z.string()),
    }),
  ),
  shareLine: z.string().min(1),
  evidencePanels: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      explanation: z.string().min(1),
      items: z.array(
        z.object({
          rawResponseId: z.string().min(1),
          question: z.string().min(1),
          answer: AnswerChoiceSchema,
          note: z.string(),
        }),
      ),
    }),
  ),
  disclaimer: z.string().min(1),
});

export type StructuredReport = z.infer<typeof StructuredReportSchema>;

export const AdaptiveConfigSchema = z.object({
  minAdaptive: z.number().int().min(0),
  targetTotal: z.number().int().min(24),
  softLimit: z.number().int().min(24),
  hardLimit: z.number().int().min(24).max(50),
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(2),
  status: z.enum(["IN_PROGRESS", "COMPLETED"]),
  phase: z.enum(["CORE", "ADAPTIVE", "REPORT"]),
  currentIndex: z.number().int().nonnegative(),
  questionOrder: z.array(z.string()),
  rawResponses: z.array(RawResponseSchema),
  evidence: z.array(AnswerEvidenceSchema),
  conditions: z.array(ConditionSchema),
  boundaryFlips: z.array(BoundaryFlipSchema),
  hiddenCosts: z.array(HiddenCostSchema),
  boundaryStates: z.array(BoundaryStateSchema),
  probeIntents: z.array(ProbeIntentSchema),
  acceptedInterpretations: z.array(z.string()),
  telemetry: z.array(AITelemetrySchema),
  adaptiveConfig: AdaptiveConfigSchema,
  structuredReport: StructuredReportSchema.optional(),
  reportStatus: z.enum(["IDLE", "GENERATING", "READY", "FALLBACK", "ERROR"]),
  reportError: z.string().optional(),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export type Session = z.infer<typeof SessionSchema>;
