import { questionById } from "@/data/questions";
import { deriveBoundaryStates } from "@/lib/domain/derive";
import { dimensionLabels } from "@/lib/domain/labels";
import {
  AnswerChoice,
  BoundaryDimension,
  BoundaryPosition,
  ReportFactsSchema,
  StructuredReportSchema,
  type AnswerEvidence,
  type Condition,
  type HiddenCost,
  type RawResponse,
  type ReportFacts,
  type Session,
  type StructuredReport,
} from "@/lib/domain/schemas";
import { latestResponses } from "@/lib/session/session";

const dimensions = Object.values(BoundaryDimension);

const principleCopy: Record<BoundaryDimension, string> = {
  [BoundaryDimension.AUTONOMY_CONTROL]: "关系需要协作，但不能用亲密取消个人决定权。",
  [BoundaryDimension.HONESTY_AUTHENTICITY]: "真实表达与知情感，是关系协商能够成立的前提。",
  [BoundaryDimension.PRIVACY_PERSONAL_SPACE]: "亲密不自动等于无限访问，空间本身也可以是关系的一部分。",
  [BoundaryDimension.LOYALTY_EXCLUSIVITY]: "忠诚边界需要被说清，而不是只靠双方猜测。",
  [BoundaryDimension.RELATIONSHIP_PRIORITY]: "关系重要，但它如何排在自我、家人和朋友之间需要具体协商。",
  [BoundaryDimension.SACRIFICE_SHARED_BURDEN]: "承担是否可持续，取决于自愿、期限、看见与回流。",
  [BoundaryDimension.CONFLICT_DIGNITY]: "问题可以尖锐，人的尊严和暂停权仍应被保留。",
  [BoundaryDimension.RESPONSIBILITY_FAIRNESS]: "公平不必每刻对半，但长期责任需要可见并能重新分配。",
  [BoundaryDimension.FORGIVENESS_REPAIR_TRUST]: "道歉开启修复，持续行动才提供重新信任的证据。",
  [BoundaryDimension.COMMITMENT_FUTURE_STRUCTURE]: "承诺不只是一种形式，也包括清晰、可执行的共同安排。",
  [BoundaryDimension.EMOTIONAL_INTIMACY_NEEDS]: "支持可以亲密，但不应默认由一个人无限承接。",
};

const unresolvedPrompts: Record<BoundaryDimension, string> = {
  [BoundaryDimension.AUTONOMY_CONTROL]: "你更在意最终决定权，还是被纳入商量的过程？",
  [BoundaryDimension.HONESTY_AUTHENTICITY]: "哪些信息属于必须主动说出的关系事实？",
  [BoundaryDimension.PRIVACY_PERSONAL_SPACE]: "安全感与私人空间发生冲突时，你需要怎样的规则？",
  [BoundaryDimension.LOYALTY_EXCLUSIVITY]: "哪些具体互动会让普通关系转为越界？",
  [BoundaryDimension.RELATIONSHIP_PRIORITY]: "什么情形足以让伴侣临时获得更高优先级？",
  [BoundaryDimension.SACRIFICE_SHARED_BURDEN]: "你愿意多承担多久，又需要看到什么回流？",
  [BoundaryDimension.CONFLICT_DIGNITY]: "事后修复能否改变你对冲突行为本身的判断？",
  [BoundaryDimension.RESPONSIBILITY_FAIRNESS]: "你用结果、投入时间，还是心理负担来判断公平？",
  [BoundaryDimension.FORGIVENESS_REPAIR_TRUST]: "什么持续行动足以证明修复正在发生？",
  [BoundaryDimension.COMMITMENT_FUTURE_STRUCTURE]: "你真正需要的是形式、时间表，还是可执行的共同计划？",
  [BoundaryDimension.EMOTIONAL_INTIMACY_NEEDS]: "支持到什么程度会开始侵占你的恢复空间？",
};

function latestList(session: Session): RawResponse[] {
  return [...latestResponses(session.rawResponses).values()].sort(
    (a, b) => a.sequence - b.sequence,
  );
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function buildReportFacts(session: Session, now = new Date()): ReportFacts {
  const responses = latestList(session);
  const latestIds = new Set(responses.map((response) => response.id));
  const evidence = session.evidence.filter((item) => latestIds.has(item.rawResponseId));
  const evidenceByResponse = new Map<string, AnswerEvidence[]>();
  evidence.forEach((item) => {
    evidenceByResponse.set(item.rawResponseId, [
      ...(evidenceByResponse.get(item.rawResponseId) ?? []),
      item,
    ]);
  });
  const boundaryStates = deriveBoundaryStates(responses, evidence);

  const deterministicConditions: Condition[] = responses
    .filter((response) => response.answer === AnswerChoice.DEPENDS)
    .filter(
      (response) =>
        !session.conditions.some((item) =>
          item.evidenceIds.some((id) =>
            (evidenceByResponse.get(response.id) ?? []).some((evidenceItem) => evidenceItem.id === id),
          ),
        ),
    )
    .map((response) => {
      const direct = evidenceByResponse.get(response.id)?.[0];
      return {
        id: `condition-direct-${response.id}`,
        dimension: response.dimensionSnapshot,
        variable: "unresolved_condition",
        statement: response.note || "用户选择了“看情况”，但决定条件尚未写明。",
        consequence: "条件变化时，这一情境的接受边界可能随之变化。",
        evidenceIds: direct ? [direct.id] : [],
        confidence: response.note ? 0.7 : 0.25,
        source: response.note ? ("USER_EXPLICIT" as const) : ("MOCK_INFERENCE" as const),
      };
    });
  const conditions = uniqueById([...session.conditions, ...deterministicConditions]);

  const costWords = /累|消耗|委屈|勉强|忍|压力|长期|只能|不得不|疲惫|牺牲|难受|放手|离开/;
  const deterministicCosts: HiddenCost[] = responses
    .filter((response) => costWords.test(response.note))
    .map((response) => {
      const direct = evidenceByResponse.get(response.id)?.[0];
      return {
        id: `hidden-cost-direct-${response.id}`,
        dimension: response.dimensionSnapshot,
        statement: `你的原话提示了可能的内在消耗：“${response.note}”`,
        longTermRisk: "短期可接受不必然代表长期可持续，需要继续观察期限、回流与退出条件。",
        evidenceIds: direct ? [direct.id] : [],
        confidence: 0.65,
        status: "TO_VALIDATE" as const,
      };
    });
  const hiddenCosts = uniqueById([...session.hiddenCosts, ...deterministicCosts]);

  const boundaryFlips = uniqueById([
    ...session.boundaryFlips,
    ...boundaryStates
      .filter((state) => state.position === BoundaryPosition.MIXED)
      .map((state) => ({
        id: `flip-mixed-${state.dimension}`,
        dimension: state.dimension,
        from: "ACCEPTABLE" as const,
        to: "NOT_ACCEPTABLE" as const,
        trigger: "同一维度的不同情境触发了相反的原始选择。",
        evidenceIds: state.evidenceIds,
        confidence: state.confidence,
      })),
  ]);

  const mustHaves = boundaryStates
    .filter(
      (state) =>
        state.evidenceIds.length > 0 &&
        [BoundaryPosition.NOT_ACCEPTABLE, BoundaryPosition.MIXED].includes(state.position),
    )
    .map((state) => ({
      dimension: state.dimension,
      statement: principleCopy[state.dimension],
      evidenceIds: state.evidenceIds,
    }));

  const knownRules = conditions
    .filter((item) => item.evidenceIds.length > 0 && item.confidence >= 0.55)
    .map((item) => ({
      dimension: item.dimension,
      statement: item.statement,
      evidenceIds: item.evidenceIds,
      confidence: item.confidence,
    }));

  const conditionalStates = boundaryStates.filter(
    (state) => state.position === BoundaryPosition.CONDITIONAL && state.evidenceIds.length,
  );
  const costDimensions = [...new Set(hiddenCosts.map((item) => item.dimension))];
  const crossDimensionPatterns = [
    ...(conditionalStates.length >= 2
      ? [
          {
            statement: "多个维度的回答都依赖具体条件，事先说清规则可能是反复出现的协商方式。",
            dimensions: conditionalStates.map((item) => item.dimension),
            evidenceIds: conditionalStates.flatMap((item) => item.evidenceIds).slice(0, 12),
          },
        ]
      : []),
    ...(costDimensions.length >= 2
      ? [
          {
            statement: "可接受与长期可持续之间的距离在多个维度出现，需要继续观察消耗是否累积。",
            dimensions: costDimensions,
            evidenceIds: hiddenCosts.flatMap((item) => item.evidenceIds).slice(0, 12),
          },
        ]
      : []),
  ];

  const uncertainties = boundaryStates
    .filter((state) => state.position === BoundaryPosition.UNRESOLVED)
    .map((state) => ({
      dimension: state.dimension,
      statement: unresolvedPrompts[state.dimension],
      evidenceIds: state.evidenceIds,
    }));
  const selectedUserNotes = responses
    .filter((response) => response.note.length > 0)
    .slice(-16)
    .map((response) => ({
      rawResponseId: response.id,
      dimension: response.dimensionSnapshot,
      note: response.note,
      evidenceIds: (evidenceByResponse.get(response.id) ?? []).map((item) => item.id),
    }))
    .filter((item) => item.evidenceIds.length > 0);
  const interpretedAnswers = new Set(
    evidence.filter((item) => item.kind === "AI_INTERPRETATION").map((item) => item.rawResponseId),
  ).size;
  const answeredQuestions = responses.filter(
    (item) => item.answer !== AnswerChoice.SKIPPED,
  ).length;

  const dimensionFacts = boundaryStates.map((state) => ({
    dimension: state.dimension,
    state,
    conditions: conditions.filter((item) => item.dimension === state.dimension),
    hiddenCosts: hiddenCosts.filter((item) => item.dimension === state.dimension),
    principleHints: evidence
      .filter((item) => item.dimension === state.dimension)
      .flatMap((item) => item.semantic?.principleHints ?? []),
    evidenceIds: state.evidenceIds,
  }));

  return ReportFactsSchema.parse({
    sessionId: session.id,
    generatedAt: now.toISOString(),
    sessionQuality: {
      answeredQuestions,
      skippedQuestions: responses.length - answeredQuestions,
      noteCount: selectedUserNotes.length,
      interpretedAnswers,
      evidenceCoverage: responses.length ? evidence.length / Math.max(1, responses.length * 2) : 0,
    },
    dimensionFacts,
    boundaryStates,
    conditions,
    boundaryFlips,
    hiddenCosts,
    mustHaves,
    knownRules,
    crossDimensionPatterns,
    uncertainties,
    selectedUserNotes,
    unresolvedDimensions: uncertainties.map((item) => item.dimension),
    evidence,
  });
}

export function buildStructuredReport(
  session: Session,
  providedFacts?: ReportFacts,
): StructuredReport {
  const facts = providedFacts ?? buildReportFacts(session);
  const priority = [
    BoundaryPosition.NOT_ACCEPTABLE,
    BoundaryPosition.MIXED,
    BoundaryPosition.CONDITIONAL,
    BoundaryPosition.UNRESOLVED,
    BoundaryPosition.ACCEPTABLE_NO_CLEAR_CROSSING,
  ];
  const ranked = [...facts.boundaryStates]
    .filter((state) => state.evidenceIds.length > 0)
    .sort((a, b) => priority.indexOf(a.position) - priority.indexOf(b.position));
  const conditionalCount = facts.boundaryStates.filter(
    (state) => state.position === BoundaryPosition.CONDITIONAL,
  ).length;
  const snapshot =
    facts.unresolvedDimensions.length >= 4
      ? "你的边界图里保留了不少真正的未知；这些区域没有被推算成中间答案。"
      : conditionalCount >= 3
        ? "从这些回答看，你的边界更像一组有前提的协议：条件、期限与修复方式会改变答案。"
        : "从这些回答看，你对若干关系底线已有清楚判断，同时仍为情境变化保留协商空间。";
  const latest = latestList(session);

  return StructuredReportSchema.parse({
    reportVersion: 2,
    generatedBy: "FALLBACK",
    title: "你的关系边界地图",
    headline: snapshot,
    snapshot,
    overview: snapshot,
    corePrinciples: ranked.slice(0, 3).map((state) => ({
      title: dimensionLabels[state.dimension],
      description: principleCopy[state.dimension],
      dimension: state.dimension,
      evidenceIds: state.evidenceIds,
    })),
    dimensionMap: facts.boundaryStates,
    boundaryFlips: facts.boundaryFlips,
    mustHaves: facts.mustHaves,
    hiddenCosts: facts.hiddenCosts,
    tensions: facts.crossDimensionPatterns.map((pattern, index) => ({
      title: `跨维度张力 ${index + 1}`,
      description: pattern.statement,
      evidenceIds: pattern.evidenceIds,
    })),
    unresolvedAreas: facts.uncertainties.map((item) => ({
      dimension: item.dimension,
      prompt: item.statement,
      evidenceIds: item.evidenceIds,
    })),
    shareLine: snapshot,
    evidencePanels: dimensions.map((dimension) => ({
      dimension,
      explanation:
        facts.boundaryStates.find((state) => state.dimension === dimension)?.summary ?? "暂无说明。",
      items: latest
        .filter((response) => response.dimensionSnapshot === dimension)
        .map((response) => ({
          rawResponseId: response.id,
          question: questionById.get(response.questionId)?.text ?? response.questionTextSnapshot,
          answer: response.answer,
          note: response.note,
        })),
    })),
    disclaimer:
      "AI 报告暂不可用；当前由结构化事实生成基础报告。它不是诊断、总分、健康度或人格类型。",
  });
}
