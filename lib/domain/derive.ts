import { positionLabels } from "./labels";
import {
  AnswerChoice,
  BoundaryDimension,
  BoundaryPosition,
  type AnswerEvidence,
  type BoundaryState,
  type RawResponse,
} from "./schemas";
import { latestResponses } from "@/lib/session/session";

const summaryByPosition: Record<BoundaryPosition, string> = {
  [BoundaryPosition.ACCEPTABLE_NO_CLEAR_CROSSING]:
    "在当前题目情境中，暂未出现明确越过接受边界的信号；这不表示偏好或喜欢。",
  [BoundaryPosition.CONDITIONAL]:
    "你的判断依赖具体条件，边界的关键在于条件能否被说清和满足。",
  [BoundaryPosition.NOT_ACCEPTABLE]:
    "在当前题目情境中，你表达了较明确的不可接受边界。",
  [BoundaryPosition.UNRESOLVED]:
    "这里包含真实的不确定或尚未回答的部分，暂不把它推算成中间位置。",
  [BoundaryPosition.MIXED]:
    "不同情境触发了相反判断，说明这条边界可能随关系状态或条件翻转。",
};

export function deriveBoundaryStates(
  responses: RawResponse[],
  evidence: AnswerEvidence[],
): BoundaryState[] {
  const latest = [...latestResponses(responses).values()];

  return Object.values(BoundaryDimension).map((dimension) => {
    const dimensionResponses = latest.filter(
      (response) => response.dimensionSnapshot === dimension,
    );
    const count = (answer: AnswerChoice) =>
      dimensionResponses.filter((response) => response.answer === answer).length;
    const answerCounts = {
      canAccept: count(AnswerChoice.CAN_ACCEPT),
      cannotAccept: count(AnswerChoice.CANNOT_ACCEPT),
      depends: count(AnswerChoice.DEPENDS),
      unsure: count(AnswerChoice.UNSURE),
      skipped: count(AnswerChoice.SKIPPED),
    };
    const currentResponseIds = new Set(dimensionResponses.map((item) => item.id));
    const dimensionEvidence = evidence.filter((item) =>
      currentResponseIds.has(item.rawResponseId),
    );
    const semanticEvidence = dimensionEvidence.filter((item) => item.semantic);

    let position: BoundaryPosition;
    if (
      dimensionResponses.length === 0 ||
      answerCounts.skipped === dimensionResponses.length ||
      answerCounts.unsure > 0
    ) {
      position = BoundaryPosition.UNRESOLVED;
    } else if (answerCounts.depends > 0) {
      position = BoundaryPosition.CONDITIONAL;
    } else if (answerCounts.canAccept > 0 && answerCounts.cannotAccept > 0) {
      position = BoundaryPosition.MIXED;
    } else if (answerCounts.cannotAccept > 0) {
      position = BoundaryPosition.NOT_ACCEPTABLE;
    } else {
      position = BoundaryPosition.ACCEPTABLE_NO_CLEAR_CROSSING;
    }

    const requiresProbe = semanticEvidence.some(
      (item) => item.semantic?.requiresFollowup || item.semantic?.semanticConflict,
    );
    const status =
      position === BoundaryPosition.UNRESOLVED
        ? "UNCERTAIN"
        : requiresProbe ||
            [BoundaryPosition.CONDITIONAL, BoundaryPosition.MIXED].includes(position)
          ? "NEEDS_PROBE"
          : "STABLE";
    const confidenceValues = semanticEvidence
      .map((item) => item.semantic?.confidence)
      .filter((value): value is number => typeof value === "number");

    return {
      dimension,
      position,
      label: positionLabels[position],
      summary: summaryByPosition[position],
      evidenceIds: dimensionEvidence.map((item) => item.id),
      answerCounts,
      confidence: confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) /
          confidenceValues.length
        : dimensionResponses.length
          ? 0.55
          : 0,
      status,
    };
  });
}
