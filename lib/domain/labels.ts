import {
  AnswerChoice,
  BoundaryDimension,
  BoundaryPosition,
} from "./schemas";

export const dimensionLabels: Record<BoundaryDimension, string> = {
  [BoundaryDimension.AUTONOMY_CONTROL]: "自主与控制",
  [BoundaryDimension.HONESTY_AUTHENTICITY]: "诚实与真实",
  [BoundaryDimension.PRIVACY_PERSONAL_SPACE]: "隐私与个人空间",
  [BoundaryDimension.LOYALTY_EXCLUSIVITY]: "忠诚与排他",
  [BoundaryDimension.RELATIONSHIP_PRIORITY]: "关系优先级",
  [BoundaryDimension.SACRIFICE_SHARED_BURDEN]: "牺牲与共同负担",
  [BoundaryDimension.CONFLICT_DIGNITY]: "冲突与尊严",
  [BoundaryDimension.RESPONSIBILITY_FAIRNESS]: "责任与公平",
  [BoundaryDimension.FORGIVENESS_REPAIR_TRUST]: "原谅、修复与信任",
  [BoundaryDimension.COMMITMENT_FUTURE_STRUCTURE]: "承诺与未来结构",
  [BoundaryDimension.EMOTIONAL_INTIMACY_NEEDS]: "情感亲密与需求",
};

export const dimensionShortLabels: Record<BoundaryDimension, string> = {
  [BoundaryDimension.AUTONOMY_CONTROL]: "自主",
  [BoundaryDimension.HONESTY_AUTHENTICITY]: "真实",
  [BoundaryDimension.PRIVACY_PERSONAL_SPACE]: "空间",
  [BoundaryDimension.LOYALTY_EXCLUSIVITY]: "忠诚",
  [BoundaryDimension.RELATIONSHIP_PRIORITY]: "优先级",
  [BoundaryDimension.SACRIFICE_SHARED_BURDEN]: "共担",
  [BoundaryDimension.CONFLICT_DIGNITY]: "尊严",
  [BoundaryDimension.RESPONSIBILITY_FAIRNESS]: "公平",
  [BoundaryDimension.FORGIVENESS_REPAIR_TRUST]: "修复",
  [BoundaryDimension.COMMITMENT_FUTURE_STRUCTURE]: "承诺",
  [BoundaryDimension.EMOTIONAL_INTIMACY_NEEDS]: "亲密",
};

export const answerLabels: Record<AnswerChoice, string> = {
  [AnswerChoice.CAN_ACCEPT]: "可以",
  [AnswerChoice.CANNOT_ACCEPT]: "不可以",
  [AnswerChoice.DEPENDS]: "看情况",
  [AnswerChoice.UNSURE]: "我不知道",
  [AnswerChoice.SKIPPED]: "已跳过",
};

export const answerPlaceholders: Record<AnswerChoice, string> = {
  [AnswerChoice.CAN_ACCEPT]: "例如：我能接受到什么程度，或在什么情况下会开始消耗……",
  [AnswerChoice.CANNOT_ACCEPT]: "例如：真正越界的点是什么，为什么这对我重要……",
  [AnswerChoice.DEPENDS]: "最关键的条件是……；如果发生……，我的答案会改变",
  [AnswerChoice.UNSURE]: "例如：我没经历过，或我还分不清自己的真实感受……",
  [AnswerChoice.SKIPPED]: "这题已跳过；之后仍可返回补答",
};

export const positionLabels: Record<BoundaryPosition, string> = {
  [BoundaryPosition.ACCEPTABLE_NO_CLEAR_CROSSING]: "暂未越界",
  [BoundaryPosition.CONDITIONAL]: "取决于条件",
  [BoundaryPosition.NOT_ACCEPTABLE]: "明确边界",
  [BoundaryPosition.UNRESOLVED]: "尚未确定",
  [BoundaryPosition.MIXED]: "边界会翻转",
};
