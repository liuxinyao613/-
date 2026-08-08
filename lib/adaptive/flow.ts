import { adaptiveQuestionBank } from "@/data/adaptive-question-bank";
import { questionById } from "@/data/questions";
import {
  BoundaryDimension,
  BoundaryPosition,
  ProbeType,
  type AdaptiveQuestionBankItem,
  type ProbeIntent,
  type ReportFacts,
  type Session,
} from "@/lib/domain/schemas";
import { latestResponses } from "@/lib/session/session";

const defaultVariable: Record<BoundaryDimension, string> = {
  [BoundaryDimension.AUTONOMY_CONTROL]: "decision_authority",
  [BoundaryDimension.HONESTY_AUTHENTICITY]: "disclosure_threshold",
  [BoundaryDimension.PRIVACY_PERSONAL_SPACE]: "access_and_space",
  [BoundaryDimension.LOYALTY_EXCLUSIVITY]: "exclusivity_rule",
  [BoundaryDimension.RELATIONSHIP_PRIORITY]: "priority_rule",
  [BoundaryDimension.SACRIFICE_SHARED_BURDEN]: "sustainability",
  [BoundaryDimension.CONFLICT_DIGNITY]: "dignity_and_pause",
  [BoundaryDimension.RESPONSIBILITY_FAIRNESS]: "fairness_rule",
  [BoundaryDimension.FORGIVENESS_REPAIR_TRUST]: "repair_evidence",
  [BoundaryDimension.COMMITMENT_FUTURE_STRUCTURE]: "commitment_structure",
  [BoundaryDimension.EMOTIONAL_INTIMACY_NEEDS]: "emotional_capacity",
};

export function adaptiveAnsweredCount(session: Session): number {
  return [...latestResponses(session.rawResponses).values()].filter(
    (response) => response.stageSnapshot === "ADAPTIVE",
  ).length;
}

export function fallbackProbePlan(session: Session, facts: ReportFacts) {
  const candidates = [...facts.dimensionFacts].sort((a, b) => {
    const score = (fact: (typeof facts.dimensionFacts)[number]) =>
      (fact.state.position === BoundaryPosition.UNRESOLVED ? 4 : 0) +
      (fact.state.status === "NEEDS_PROBE" ? 3 : 0) +
      (fact.hiddenCosts.length ? 2 : 0) +
      (fact.conditions.length ? 1 : 0) -
      fact.state.evidenceIds.length * 0.1;
    return score(b) - score(a);
  });
  const intents: ProbeIntent[] = candidates.slice(0, 3).map((fact, index) => {
    const probeType =
      fact.state.position === BoundaryPosition.UNRESOLVED
        ? ProbeType.UNCERTAINTY_PROBE
        : fact.hiddenCosts.length
          ? ProbeType.HIDDEN_COST_PROBE
          : fact.state.position === BoundaryPosition.MIXED
            ? ProbeType.CONTRADICTION_RESOLUTION
            : fact.conditions.length
              ? ProbeType.CONDITION_CLARIFICATION
              : ProbeType.CROSS_CONTEXT_VALIDATION;
    return {
      id: `fallback-intent-${Date.now()}-${index}`,
      dimension: fact.dimension,
      probeType,
      targetVariable: fact.conditions[0]?.variable ?? defaultVariable[fact.dimension],
      informationGoal: "用一个温和的新情境验证当前边界是否稳定。",
      fixedVariables: [],
      desiredChange: "只改变一个关键情境变量。",
      preferredTags: [],
      desiredExtremity: 2,
      priority: Math.max(0.3, 0.9 - index * 0.15),
    };
  });
  const enough = adaptiveAnsweredCount(session) >= session.adaptiveConfig.minAdaptive;
  return {
    intents,
    stop: enough && intents.every((item) => item.priority < 0.4),
    rationale: "AI Planner 不可用，按未确定、Hidden Cost、条件和证据覆盖确定性选择。",
  };
}

function bigrams(text: string): Set<string> {
  const normalized = text.replace(/[\s，。；、？！“”]/g, "");
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function similarity(a: string, b: string): number {
  const left = bigrams(a);
  const right = bigrams(b);
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function scoreQuestion(
  question: AdaptiveQuestionBankItem,
  intent: ProbeIntent,
  recentDimensions: BoundaryDimension[],
): number {
  const tagMatches = question.scenarioTags.filter((tag) =>
    intent.preferredTags.includes(tag),
  ).length;
  const variableMatch = question.variables.includes(intent.targetVariable);
  const secondaryMatch = question.secondaryDimensions.includes(intent.dimension);
  const cooldownPenalty = recentDimensions.includes(question.primaryDimension) ? 6 : 0;
  return (
    (question.primaryDimension === intent.dimension ? 40 : secondaryMatch ? 16 : 0) +
    (variableMatch ? 24 : 0) +
    tagMatches * 7 -
    Math.abs(question.extremity - intent.desiredExtremity) * 5 -
    cooldownPenalty +
    intent.priority * 10
  );
}

export function selectAdaptiveQuestions(
  session: Session,
  intents: ProbeIntent[],
  limit = 3,
): AdaptiveQuestionBankItem[] {
  const reserved = new Set(session.questionOrder);
  const askedQuestions = session.questionOrder
    .map((id) => questionById.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const recentDimensions = [...latestResponses(session.rawResponses).values()]
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 2)
    .map((item) => item.dimensionSnapshot);
  let projectedRecentDimensions = recentDimensions;
  const adaptiveAnswered = adaptiveAnsweredCount(session);
  const selected: AdaptiveQuestionBankItem[] = [];

  for (const intent of [...intents].sort((a, b) => b.priority - a.priority)) {
    const blockedDimension =
      projectedRecentDimensions.length === 2 &&
      projectedRecentDimensions[0] === projectedRecentDimensions[1]
        ? projectedRecentDimensions[0]
        : null;
    const maxExtremity =
      intent.desiredExtremity >= 4 && adaptiveAnswered >= session.adaptiveConfig.minAdaptive
        ? 4
        : 3;
    const candidates = adaptiveQuestionBank
      .filter((question) => !reserved.has(question.id))
      .filter((question) => question.primaryDimension !== blockedDimension)
      .filter((question) => question.extremity <= maxExtremity)
      .filter(
        (question) =>
          question.primaryDimension === intent.dimension ||
          question.secondaryDimensions.includes(intent.dimension),
      )
      .filter(
        (question) =>
          !askedQuestions.some((asked) => similarity(question.text, asked.text) >= 0.82),
      )
      .sort(
        (a, b) =>
          scoreQuestion(b, intent, projectedRecentDimensions) -
          scoreQuestion(a, intent, projectedRecentDimensions),
      );
    const best = candidates[0];
    if (best) {
      selected.push(best);
      reserved.add(best.id);
      projectedRecentDimensions = [
        best.primaryDimension,
        ...projectedRecentDimensions,
      ].slice(0, 2);
    }
    if (selected.length >= limit) break;
  }

  return selected;
}

export function shouldStopAdaptive(
  session: Session,
  plannerStop: boolean,
  selectedCount: number,
): boolean {
  const answeredTotal = latestResponses(session.rawResponses).size;
  const adaptiveAnswered = adaptiveAnsweredCount(session);
  if (answeredTotal >= session.adaptiveConfig.hardLimit) return true;
  if (answeredTotal >= session.adaptiveConfig.targetTotal) return true;
  if (answeredTotal >= session.adaptiveConfig.softLimit && selectedCount === 0) return true;
  return (
    adaptiveAnswered >= session.adaptiveConfig.minAdaptive &&
    plannerStop &&
    selectedCount === 0
  );
}
