import type { ReportWriterPayload, WriteReportInput } from "@/lib/ai/contracts";
import {
  StructuredReportSchema,
  type StructuredReport,
} from "@/lib/domain/schemas";
import { buildStructuredReport } from "./build-report";

export function normalizeAIReport(
  payload: ReportWriterPayload,
  input: WriteReportInput,
): StructuredReport {
  const fallback = buildStructuredReport(input.session, input.facts);
  const validEvidence = new Set(input.facts.evidence.map((item) => item.id));
  const filterEvidence = (ids: string[]) => ids.filter((id) => validEvidence.has(id));

  const corePrinciples = payload.corePrinciples
    .map((item) => ({ ...item, evidenceIds: filterEvidence(item.evidenceIds) }))
    .filter((item) => item.evidenceIds.length > 0);
  const aiDimensions = new Map(
    payload.dimensions.map((item) => [item.dimension, item]),
  );

  return StructuredReportSchema.parse({
    ...fallback,
    generatedBy: "AI",
    boundaryLabel: payload.boundaryLabel,
    headline: payload.headline,
    overview: payload.overview,
    snapshot: payload.overview,
    corePrinciples: corePrinciples.length ? corePrinciples : fallback.corePrinciples,
    dimensionMap: fallback.dimensionMap.map((state) => {
      const ai = aiDimensions.get(state.dimension);
      const evidenceIds = ai ? filterEvidence(ai.evidenceIds) : [];
      return ai && evidenceIds.length
        ? { ...state, label: ai.label, summary: ai.summary, evidenceIds }
        : state;
    }),
    boundaryFlips: payload.boundaryFlips
      .map((item, index) => ({
        id: `ai-flip-${index}-${item.dimension}`,
        dimension: item.dimension,
        from: "ACCEPTABLE" as const,
        to: "NOT_ACCEPTABLE" as const,
        trigger: item.trigger,
        evidenceIds: filterEvidence(item.evidenceIds),
        confidence: item.confidence,
      }))
      .filter((item) => item.evidenceIds.length > 0),
    mustHaves: payload.mustHaves
      .map((item) => ({ ...item, evidenceIds: filterEvidence(item.evidenceIds) }))
      .filter((item) => item.evidenceIds.length > 0),
    hiddenCosts: payload.hiddenCosts
      .map((item, index) => ({
        id: `ai-hidden-cost-${index}-${item.dimension}`,
        dimension: item.dimension,
        statement: item.statement,
        longTermRisk: item.longTermRisk,
        evidenceIds: filterEvidence(item.evidenceIds),
        confidence: item.confidence,
        status: "OBSERVED" as const,
      }))
      .filter((item) => item.evidenceIds.length > 0),
    tensions: payload.tensions
      .map((item) => ({ ...item, evidenceIds: filterEvidence(item.evidenceIds) }))
      .filter((item) => item.evidenceIds.length > 0),
    unresolvedAreas: payload.uncertainties.map((item) => ({
      ...item,
      evidenceIds: filterEvidence(item.evidenceIds),
    })),
    shareLine: payload.shareLine,
    disclaimer:
      "这份报告由 AI 根据本次结构化 Evidence 生成，不是诊断、总分、健康度或人格类型。",
  });
}
