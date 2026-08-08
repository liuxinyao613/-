import {
  AdaptiveQuestionBankItemSchema,
  BoundaryDimension as D,
  type AdaptiveQuestionBankItem,
} from "@/lib/domain/schemas";

type BankSpec = {
  id: string;
  dimension: D;
  text: string;
  tags: string[];
  variables: string[];
  extremity: number;
  secondary?: D[];
  context?: string;
};

const specs: BankSpec[] = [
  { id: "autonomy-01", dimension: D.AUTONOMY_CONTROL, text: "当你忙到无力安排生活时，伴侣暂时替你做日常决定，并在事后告诉你。", tags: ["daily-life", "temporary", "decision"], variables: ["decision_authority", "advance_notice"], extremity: 1 },
  { id: "autonomy-02", dimension: D.AUTONOMY_CONTROL, text: "伴侣希望你临时改变个人计划前先报备，即使这件事并不影响对方。", tags: ["schedule", "permission", "coordination"], variables: ["coordination_vs_permission", "personal_schedule"], extremity: 2 },
  { id: "autonomy-03", dimension: D.AUTONOMY_CONTROL, text: "涉及共同大额支出时，只要一方不同意，这项决定就暂时不能推进。", tags: ["finance", "shared-decision", "veto"], variables: ["veto_right", "shared_impact"], extremity: 3, secondary: [D.RESPONSIBILITY_FAIRNESS] },
  { id: "autonomy-04", dimension: D.AUTONOMY_CONTROL, text: "伴侣希望你放弃一个重要工作机会，因为对方不愿承受异地或搬迁。", tags: ["career", "relocation", "future"], variables: ["career_autonomy", "relationship_cost"], extremity: 3, secondary: [D.COMMITMENT_FUTURE_STRUCTURE] },

  { id: "honesty-01", dimension: D.HONESTY_AUTHENTICITY, text: "伴侣先花几天整理情绪，再告诉你一件可能引发争执的重要事实。", tags: ["delay", "difficult-truth", "conflict"], variables: ["disclosure_timing", "material_fact"], extremity: 2 },
  { id: "honesty-02", dimension: D.HONESTY_AUTHENTICITY, text: "伴侣对不影响关系的私人往事保留细节，但明确告诉你自己不想展开。", tags: ["past", "privacy", "disclosure"], variables: ["privacy_vs_concealment", "materiality"], extremity: 1, secondary: [D.PRIVACY_PERSONAL_SPACE] },
  { id: "honesty-03", dimension: D.HONESTY_AUTHENTICITY, text: "你对关系中的一项安排已经不满意，但会先说“没事”，等合适时机再谈。", tags: ["self-expression", "harmony", "timing"], variables: ["authentic_expression", "discussion_timing"], extremity: 2 },
  { id: "honesty-04", dimension: D.HONESTY_AUTHENTICITY, text: "一个误会恰好让你获益，但纠正它可能让伴侣失望，你仍会主动说明。", tags: ["benefit", "correction", "trust"], variables: ["truth_cost", "active_disclosure"], extremity: 3 },

  { id: "privacy-01", dimension: D.PRIVACY_PERSONAL_SPACE, text: "发生过一次信任破坏后，伴侣希望在修复期内临时查看你的手机。", tags: ["phone", "repair", "temporary"], variables: ["temporary_transparency", "repair_duration"], extremity: 3, secondary: [D.FORGIVENESS_REPAIR_TRUST] },
  { id: "privacy-02", dimension: D.PRIVACY_PERSONAL_SPACE, text: "即使关系很好，你仍固定每周留出一段不联系、不解释用途的独处时间。", tags: ["alone-time", "routine", "no-contact"], variables: ["personal_space", "explanation_requirement"], extremity: 1 },
  { id: "privacy-03", dimension: D.PRIVACY_PERSONAL_SPACE, text: "伴侣把你们的矛盾告诉一位可信朋友，但不透露能识别你的隐私细节。", tags: ["friend-support", "conflict", "anonymized"], variables: ["external_support", "detail_boundary"], extremity: 2 },
  { id: "privacy-04", dimension: D.PRIVACY_PERSONAL_SPACE, text: "独自出差或夜间回家时，双方约定临时共享位置，到达后自动关闭。", tags: ["location", "safety", "temporary"], variables: ["location_sharing", "safety_context"], extremity: 1 },

  { id: "loyalty-01", dimension: D.LOYALTY_EXCLUSIVITY, text: "伴侣因共同事务与前任保持联系，并主动告诉你联系的范围和频率。", tags: ["ex", "transparency", "practical"], variables: ["ex_contact", "transparency"], extremity: 2 },
  { id: "loyalty-02", dimension: D.LOYALTY_EXCLUSIVITY, text: "伴侣与一位新朋友单独吃晚饭，双方没有暧昧表达，也没有隐瞒。", tags: ["friendship", "one-on-one", "transparent"], variables: ["one_on_one_contact", "romantic_signal"], extremity: 1 },
  { id: "loyalty-03", dimension: D.LOYALTY_EXCLUSIVITY, text: "伴侣在网络上与固定对象保持带有性或暧昧意味的互动，但从不线下见面。", tags: ["online", "flirting", "sexual"], variables: ["digital_exclusivity", "interaction_intent"], extremity: 3 },
  { id: "loyalty-04", dimension: D.LOYALTY_EXCLUSIVITY, text: "关系中途，一方希望重新讨论原本默认的排他规则，而不是继续按旧默契执行。", tags: ["renegotiation", "exclusivity", "relationship-change"], variables: ["rule_renegotiation", "consent"], extremity: 3, secondary: [D.COMMITMENT_FUTURE_STRUCTURE] },

  { id: "priority-01", dimension: D.RELATIONSHIP_PRIORITY, text: "伴侣遇到突发事件时，你取消一次普通社交安排去陪伴对方。", tags: ["emergency", "cancel-plan", "support"], variables: ["urgency", "plan_priority"], extremity: 1 },
  { id: "priority-02", dimension: D.RELATIONSHIP_PRIORITY, text: "伴侣希望大多数周末优先留给两个人，再安排各自朋友和爱好。", tags: ["weekend", "routine", "time-allocation"], variables: ["recurring_priority", "personal_time"], extremity: 2 },
  { id: "priority-03", dimension: D.RELATIONSHIP_PRIORITY, text: "伴侣与你的家人发生长期矛盾后，希望你在公开场合始终先站在伴侣一边。", tags: ["family", "public-support", "long-term-conflict"], variables: ["alliance_expectation", "family_boundary"], extremity: 3 },
  { id: "priority-04", dimension: D.RELATIONSHIP_PRIORITY, text: "你的重要职业节点与伴侣的重要纪念日冲突，而两件事都无法改期。", tags: ["career", "milestone", "schedule-conflict"], variables: ["competing_milestones", "priority_rule"], extremity: 3, secondary: [D.AUTONOMY_CONTROL] },

  { id: "burden-01", dimension: D.SACRIFICE_SHARED_BURDEN, text: "伴侣暂时失业时，你多承担三个月开销，同时双方有明确的调整计划。", tags: ["finance", "temporary", "plan"], variables: ["support_duration", "recovery_plan"], extremity: 2, secondary: [D.RESPONSIBILITY_FAIRNESS] },
  { id: "burden-02", dimension: D.SACRIFICE_SHARED_BURDEN, text: "为了伴侣的机会你先搬去另一座城市，但约定半年后重新评估两个人的发展。", tags: ["relocation", "review", "career"], variables: ["sacrifice_duration", "reversibility"], extremity: 3, secondary: [D.COMMITMENT_FUTURE_STRUCTURE] },
  { id: "burden-03", dimension: D.SACRIFICE_SHARED_BURDEN, text: "伴侣需要长期照护家人，希望你稳定承担更多家务和生活安排。", tags: ["caregiving", "household", "long-term"], variables: ["burden_duration", "recognition_and_return"], extremity: 3, secondary: [D.RESPONSIBILITY_FAIRNESS] },
  { id: "burden-04", dimension: D.SACRIFICE_SHARED_BURDEN, text: "伴侣再次遇到经济困难，但这次主要来自长期没有改变的消费习惯。", tags: ["finance", "repeated", "rescue"], variables: ["emergency_vs_pattern", "accountability"], extremity: 3, secondary: [D.RESPONSIBILITY_FAIRNESS] },

  { id: "conflict-01", dimension: D.CONFLICT_DIGNITY, text: "争执暂停后，双方约定在二十四小时内重新回来继续谈。", tags: ["pause", "return", "agreement"], variables: ["pause_right", "return_timing"], extremity: 1 },
  { id: "conflict-02", dimension: D.CONFLICT_DIGNITY, text: "伴侣在一次激烈争执中说了贬低你的话，之后承认伤害并主动修复。", tags: ["contempt", "repair", "one-time"], variables: ["dignity_violation", "repair_quality"], extremity: 3, secondary: [D.FORGIVENESS_REPAIR_TRUST] },
  { id: "conflict-03", dimension: D.CONFLICT_DIGNITY, text: "伴侣在朋友面前指出你的问题，内容属实，但没有事先和你沟通。", tags: ["public", "criticism", "truth"], variables: ["public_criticism", "advance_discussion"], extremity: 2 },
  { id: "conflict-04", dimension: D.CONFLICT_DIGNITY, text: "每次争执后双方都能和好，但相同的吼叫和讽刺仍反复出现。", tags: ["repeated", "yelling", "repair-failure"], variables: ["repetition", "behavior_change"], extremity: 3, secondary: [D.FORGIVENESS_REPAIR_TRUST] },

  { id: "fairness-01", dimension: D.RESPONSIBILITY_FAIRNESS, text: "一段时间里，一方工作更忙，家务暂时按精力而不是平均分配。", tags: ["household", "capacity", "temporary"], variables: ["capacity_based_fairness", "review_cycle"], extremity: 1 },
  { id: "fairness-02", dimension: D.RESPONSIBILITY_FAIRNESS, text: "两个人完成的家务数量接近，但计划、提醒和发现问题长期主要由你承担。", tags: ["mental-load", "household", "invisible-work"], variables: ["mental_load", "visible_task_count"], extremity: 2 },
  { id: "fairness-03", dimension: D.RESPONSIBILITY_FAIRNESS, text: "伴侣婚前形成的债务开始影响共同生活，希望你一起加速偿还。", tags: ["debt", "finance", "shared-life"], variables: ["prior_responsibility", "shared_consequence"], extremity: 3 },
  { id: "fairness-04", dimension: D.RESPONSIBILITY_FAIRNESS, text: "伴侣愿意为失误道歉，但同类后果仍经常需要你收尾。", tags: ["repeated", "mistake", "cleanup"], variables: ["accountability", "repeated_consequence"], extremity: 2 },

  { id: "repair-01", dimension: D.FORGIVENESS_REPAIR_TRUST, text: "信任受损后，双方约定一段明确期限的额外透明，而不是无限期检查。", tags: ["trust", "temporary", "transparency"], variables: ["repair_evidence", "repair_duration"], extremity: 2, secondary: [D.PRIVACY_PERSONAL_SPACE] },
  { id: "repair-02", dimension: D.FORGIVENESS_REPAIR_TRUST, text: "同一个小承诺多次落空，但对方每次都能说明原因并提出新的具体做法。", tags: ["repeated", "small-breach", "action-plan"], variables: ["repetition_threshold", "repair_action"], extremity: 2 },
  { id: "repair-03", dimension: D.FORGIVENESS_REPAIR_TRUST, text: "对方已经持续改变，但你仍需要很长时间才能恢复原来的信任程度。", tags: ["time", "behavior-change", "trust-recovery"], variables: ["trust_timeline", "observed_change"], extremity: 2 },
  { id: "repair-04", dimension: D.FORGIVENESS_REPAIR_TRUST, text: "伴侣的道歉非常真诚，但几个月后仍没有能被观察到的行为变化。", tags: ["apology", "no-change", "long-term"], variables: ["apology_vs_action", "repair_threshold"], extremity: 3 },

  { id: "commitment-01", dimension: D.COMMITMENT_FUTURE_STRUCTURE, text: "双方长期稳定交往，但各自居住，并把这种安排视为明确的共同选择。", tags: ["living-apart", "stable", "chosen-structure"], variables: ["cohabitation_need", "structure_clarity"], extremity: 1 },
  { id: "commitment-02", dimension: D.COMMITMENT_FUTURE_STRUCTURE, text: "双方保留个人账户，只为共同支出建立一个透明的共享账户。", tags: ["finance", "partial-merge", "structure"], variables: ["financial_integration", "transparency"], extremity: 1, secondary: [D.PRIVACY_PERSONAL_SPACE] },
  { id: "commitment-03", dimension: D.COMMITMENT_FUTURE_STRUCTURE, text: "伴侣愿意谈未来方向，但始终不愿给任何可以复盘的时间节点。", tags: ["future", "timeline", "ambiguity"], variables: ["timeline_clarity", "commitment_evidence"], extremity: 2 },
  { id: "commitment-04", dimension: D.COMMITMENT_FUTURE_STRUCTURE, text: "关系的实际投入很稳定，但伴侣不愿使用任何明确的关系称呼。", tags: ["label", "stability", "ambiguity"], variables: ["relationship_label", "behavioral_commitment"], extremity: 2 },

  { id: "intimacy-01", dimension: D.EMOTIONAL_INTIMACY_NEEDS, text: "工作日很忙时，双方只在固定时间联系，而不要求随时回复。", tags: ["messaging", "work", "routine"], variables: ["response_frequency", "availability"], extremity: 1 },
  { id: "intimacy-02", dimension: D.EMOTIONAL_INTIMACY_NEEDS, text: "伴侣情绪低落时会先找你支持，但也会主动联系朋友或专业帮助。", tags: ["support-network", "distress", "shared-load"], variables: ["support_distribution", "primary_support"], extremity: 1 },
  { id: "intimacy-03", dimension: D.EMOTIONAL_INTIMACY_NEEDS, text: "你压力最大的时候更需要独处，但伴侣会把减少联系理解成感情变淡。", tags: ["stress", "alone-time", "misinterpretation"], variables: ["stress_response", "contact_meaning"], extremity: 2, secondary: [D.PRIVACY_PERSONAL_SPACE] },
  { id: "intimacy-04", dimension: D.EMOTIONAL_INTIMACY_NEEDS, text: "伴侣长期把大部分负面情绪只告诉你，并不愿建立其他支持渠道。", tags: ["exclusive-support", "long-term", "emotional-load"], variables: ["support_exclusivity", "emotional_capacity"], extremity: 3, secondary: [D.SACRIFICE_SHARED_BURDEN] },
];

export const adaptiveQuestionBank: AdaptiveQuestionBankItem[] = specs.map(
  (spec, index) =>
    AdaptiveQuestionBankItemSchema.parse({
      id: `bank-${spec.id}`,
      version: 1,
      stage: "ADAPTIVE",
      order: 24 + index,
      dimension: spec.dimension,
      primaryDimension: spec.dimension,
      secondaryDimensions: spec.secondary ?? [],
      text: spec.text,
      context: spec.context,
      scenarioTags: spec.tags,
      variables: spec.variables,
      extremity: spec.extremity,
      semanticKey: spec.id,
      source: "QUESTION_BANK",
      core: false,
    }),
);
