import {
  BoundaryDimension,
  QuestionSchema,
  type Question,
} from "@/lib/domain/schemas";

const legacySpecs = [
  ["probe-01", BoundaryDimension.AUTONOMY_CONTROL, "如果共同决定会让效率变低，但能让你保留参与感，你仍会坚持先商量吗？"],
  ["probe-02", BoundaryDimension.HONESTY_AUTHENTICITY, "如果诚实表达会让对方短期失望，你仍希望双方把真实感受说出来吗？"],
  ["probe-03", BoundaryDimension.LOYALTY_EXCLUSIVITY, "当一段外部关系让你不安时，只要双方事先说清规则并保持透明，你就能接受吗？"],
  ["probe-04", BoundaryDimension.SACRIFICE_SHARED_BURDEN, "一项牺牲即使是你自愿做出的，如果长期没有被看见或回馈，你还能持续吗？"],
  ["probe-05", BoundaryDimension.CONFLICT_DIGNITY, "如果对方愿意事后修复，冲突中一次失控的表达会变得可以接受吗？"],
  ["probe-06", BoundaryDimension.FORGIVENESS_REPAIR_TRUST, "对你而言，真正的修复是否必须包含可观察的持续行动，而不只是道歉？"],
  ["probe-07", BoundaryDimension.COMMITMENT_FUTURE_STRUCTURE, "即使没有传统关系形式，只要双方有清晰、可执行的共同安排，你会感到关系足够确定吗？"],
  ["probe-08", BoundaryDimension.EMOTIONAL_INTIMACY_NEEDS, "当你在提供情绪支持后明显疲惫，你会把减少支持视为合理边界吗？"],
] as const;

export const mockProbeQuestions: Question[] = QuestionSchema.array().parse(
  legacySpecs.map(([id, dimension, text], index) => ({
    id,
    version: 1,
    stage: "ADAPTIVE",
    order: 24 + index,
    dimension,
    text,
    context: "Phase 1 旧会话兼容题。",
    source: "MOCK_ADAPTIVE",
    core: false,
    primaryDimension: dimension,
    secondaryDimensions: [],
    scenarioTags: ["legacy-mock"],
    variables: [],
    extremity: 2,
  })),
);
