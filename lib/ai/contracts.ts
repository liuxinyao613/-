import { z } from "zod";
import {
  AcceptanceSemantic,
  AITelemetrySchema,
  BoundaryDimensionSchema,
  DiscomfortLevel,
  ExitSignal,
  ProbeIntentSchema,
  ProbeType,
  QuestionSchema,
  RawResponseSchema,
  RelationshipStateChange,
  ReportFactsSchema,
  SessionSchema,
  StructuredReportSchema,
  SustainabilityLevel,
  AnswerEvidenceSchema,
  KnownRuleSchema,
} from "@/lib/domain/schemas";

export const InterpretAnswerInputSchema = z.object({
  question: QuestionSchema,
  response: RawResponseSchema,
  relatedEvidence: z.array(AnswerEvidenceSchema).max(8).default([]),
  knownRules: z.array(KnownRuleSchema).max(6).default([]),
});

export const InterpreterConditionSchema = z.object({
  variable: z.string().min(1),
  statement: z.string().min(1),
  consequence: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const AnswerInterpretationPayloadSchema = z.object({
  acceptance: z.nativeEnum(AcceptanceSemantic),
  discomfort: z.nativeEnum(DiscomfortLevel),
  sustainability: z.nativeEnum(SustainabilityLevel),
  conditional: z.boolean(),
  conditions: z.array(InterpreterConditionSchema).max(6),
  relationshipStateChange: z.nativeEnum(RelationshipStateChange),
  exitSignal: z.nativeEnum(ExitSignal),
  principleHints: z.array(z.string().min(1)).max(5),
  semanticConflict: z.object({
    present: z.boolean(),
    description: z.string(),
  }),
  requiresFollowup: z.boolean(),
  followupReason: z.string(),
  summary: z.string().min(1),
  sourceQuote: z.string(),
  confidence: z.number().min(0).max(1),
});

export const InterpretAnswerOutputSchema = AnswerInterpretationPayloadSchema.extend({
  interpretationId: z.string().min(1),
  rawResponseId: z.string().min(1),
  dimension: BoundaryDimensionSchema,
});

export const PlanProbeInputSchema = z.object({
  session: SessionSchema,
  facts: ReportFactsSchema,
});

export const ProbeIntentPayloadSchema = ProbeIntentSchema.omit({ id: true });

export const ProbePlanPayloadSchema = z.object({
  intents: z.array(ProbeIntentPayloadSchema).max(3),
  stop: z.boolean(),
  rationale: z.string().min(1),
});

export const PlanProbeOutputSchema = z.object({
  intents: z.array(ProbeIntentSchema).max(3),
  stop: z.boolean(),
  rationale: z.string().min(1),
});

export const GenerateQuestionInputSchema = z.object({
  session: SessionSchema,
  intent: ProbeIntentSchema,
});

export const GenerateQuestionOutputSchema = z.object({
  question: QuestionSchema,
});

const EvidenceConclusionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
});

export const ReportWriterPayloadSchema = z.object({
  boundaryLabel: z.string().min(2).max(18),
  headline: z.string().min(1),
  overview: z.string().min(1),
  corePrinciples: z.array(
    EvidenceConclusionSchema.extend({ dimension: BoundaryDimensionSchema }),
  ).min(1).max(5),
  dimensions: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      label: z.string().min(1),
      summary: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  boundaryFlips: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      trigger: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
      confidence: z.number().min(0).max(1),
    }),
  ),
  mustHaves: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      statement: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
    }),
  ),
  hiddenCosts: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      statement: z.string().min(1),
      longTermRisk: z.string().min(1),
      evidenceIds: z.array(z.string()).min(1),
      confidence: z.number().min(0).max(1),
    }),
  ),
  tensions: z.array(EvidenceConclusionSchema).max(6),
  uncertainties: z.array(
    z.object({
      dimension: BoundaryDimensionSchema,
      prompt: z.string().min(1),
      evidenceIds: z.array(z.string()),
    }),
  ),
  shareLine: z.string().min(1),
});

export const WriteReportInputSchema = z.object({
  session: SessionSchema,
  facts: ReportFactsSchema,
});

export const WriteReportOutputSchema = z.object({
  report: StructuredReportSchema,
});

export const AIResponseEnvelopeSchema = <T extends z.ZodType>(schema: T) =>
  z.object({
    ok: z.literal(true),
    data: schema,
    telemetry: AITelemetrySchema,
  });

export const AIErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({ type: z.string(), message: z.string() }),
  telemetry: AITelemetrySchema.optional(),
});

export type InterpretAnswerInput = z.infer<typeof InterpretAnswerInputSchema>;
export type AnswerInterpretationPayload = z.infer<typeof AnswerInterpretationPayloadSchema>;
export type InterpretAnswerOutput = z.infer<typeof InterpretAnswerOutputSchema>;
export type PlanProbeInput = z.infer<typeof PlanProbeInputSchema>;
export type PlanProbeOutput = z.infer<typeof PlanProbeOutputSchema>;
export type GenerateQuestionInput = z.infer<typeof GenerateQuestionInputSchema>;
export type GenerateQuestionOutput = z.infer<typeof GenerateQuestionOutputSchema>;
export type ReportWriterPayload = z.infer<typeof ReportWriterPayloadSchema>;
export type WriteReportInput = z.infer<typeof WriteReportInputSchema>;
export type WriteReportOutput = z.infer<typeof WriteReportOutputSchema>;

export function validateProviderOutput<T>(schema: z.ZodType<T>, payload: unknown): T {
  return schema.parse(payload);
}

export const allowedProbeTypes = Object.values(ProbeType);
