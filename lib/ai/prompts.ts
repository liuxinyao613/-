import type {
  InterpretAnswerInput,
  PlanProbeInput,
  WriteReportInput,
} from "./contracts";
import { answerLabels, dimensionLabels } from "@/lib/domain/labels";

export const AI_PROMPT_VERSION = "phase2-ai-v2";

function uniqueStrings(values: string[], limit: number): string[] {
  return [...new Set(values)].slice(0, limit);
}

export const interpreterSystemPrompt = `你是 Relationship Boundary Map 的 Answer Interpreter。
你只解释用户对一个具体关系情境的第二层语义，不做人格、依恋、童年、创伤、心理疾病或道德判断。
原始按钮是不可改写的事实：可以=ACCEPT，不可以=REJECT，看情况=DEPENDS，我不知道=UNKNOWN，跳过=SKIPPED。
即使补充文字表达痛苦、不可持续或未来离开，也不能改变 acceptance；请把这些信息放入 discomfort、sustainability、relationshipStateChange、exitSignal 和 semanticConflict。
DEPENDS 要优先提取真正决定答案的条件变量。UNKNOWN 必须保持 UNKNOWN，不得当作中间值。
sourceQuote 只能逐字引用本次 note 中的短片段；note 为空时返回空字符串。
以下是语义校准锚点，不得借此改变原始 acceptance：
- “可以，但是会很难受”：ACCEPT + discomfort=HIGH。
- “救急不救穷”：提取“短期紧急帮助 / 长期重复承担”的条件变量。
- “工作需要的话可以”：提取 work necessity 条件，conditional=true。
- “可以，但是时间久了我应该会慢慢放手”：ACCEPT + discomfort=HIGH + sustainability=LOW + exitSignal=DELAYED_EXIT。
使用克制、事实性的中文。`;

export function interpreterUserPrompt(input: InterpretAnswerInput): string {
  return JSON.stringify({
    question: {
      id: input.question.id,
      text: input.question.text,
      dimension: dimensionLabels[input.question.dimension],
      variables: input.question.variables,
    },
    raw_response: {
      choice: input.response.answer,
      choice_label: answerLabels[input.response.answer],
      note_verbatim: input.response.note,
    },
    related_evidence: input.relatedEvidence.map((item) => ({
      supports: item.supports,
      semantic: item.semantic,
    })),
    known_rules: input.knownRules,
  });
}

export const plannerSystemPrompt = `你是 Relationship Boundary Map 的 Probe Planner。
你的任务是判断“现在最值得搞清楚什么”，不是追求刺激或极端。
最多返回 3 个 ProbeIntent，不返回问题文本。probeType 只能使用给定 enum。
优先澄清条件、真实未知、语义冲突、长期 Hidden Cost 和跨情境稳定性。
大部分 desiredExtremity 保持 1–3。不要进行人格、依恋、童年、创伤、疾病或道德判断。
如果高价值信息已经足够，可以 stop=true。`;

export function plannerUserPrompt(input: PlanProbeInput): string {
  return JSON.stringify({
    adaptive_answered: input.session.rawResponses.filter(
      (response) => response.stageSnapshot === "ADAPTIVE",
    ).length,
    limits: input.session.adaptiveConfig,
    session_quality: input.facts.sessionQuality,
    dimension_facts: input.facts.dimensionFacts.map((fact) => ({
      dimension: fact.dimension,
      position: fact.state.position,
      status: fact.state.status,
      answer_counts: fact.state.answerCounts,
      conditions: fact.conditions.map((item) => item.variable),
      hidden_costs: fact.hiddenCosts.map((item) => item.statement),
      principle_hints: uniqueStrings(fact.principleHints, 4),
    })),
    unresolved: input.facts.uncertainties,
    known_rules: input.facts.knownRules.map((item) => ({
      dimension: item.dimension,
      statement: item.statement,
    })),
    recent_probe_intents: input.session.probeIntents.slice(-4).map((item) => ({
      dimension: item.dimension,
      probe_type: item.probeType,
      target_variable: item.targetVariable,
      information_goal: item.informationGoal,
      priority: item.priority,
    })),
  });
}

export const reportSystemPrompt = `你是 Relationship Boundary Map 的 Report Writer。
只根据 ReportFacts 写结构化关系边界报告，不做人格诊断、心理诊断、依恋类型、童年推断、道德排名或健康度判断。
每个重要结论必须引用给定 evidence id。不得编造 evidence id。
允许跨维度归纳，但使用“从这些回答看”“你似乎更倾向于”“这一原则在多个场景中反复出现”等克制语言。
不要把任何关系规则写成普遍正确答案。UNKNOWN 保持为不确定。
boundaryLabel 是本次边界图的中文称谓：4–10 个汉字，好听、清楚、克制，并能概括证据中最反复出现的边界方式。它只是对本次关系边界模式的命名，不是人格类型、身份、依恋风格、诊断或终身定论；不要使用“型人格”“患者”“健康/不健康”等词。
headline 是一句话画像；overview 是整体说明；shareLine 是可单独分享但不标签化用户的一句话。`;

export function reportUserPrompt(input: WriteReportInput): string {
  return JSON.stringify({
    session_quality: input.facts.sessionQuality,
    dimension_facts: input.facts.dimensionFacts.map((fact) => ({
      dimension: fact.dimension,
      position: fact.state.position,
      label: fact.state.label,
      summary: fact.state.summary,
      status: fact.state.status,
      confidence: fact.state.confidence,
      answer_counts: fact.state.answerCounts,
      conditions: fact.conditions.map((item) => ({
        variable: item.variable,
        statement: item.statement,
        consequence: item.consequence,
        evidence_ids: item.evidenceIds,
      })),
      hidden_costs: fact.hiddenCosts.map((item) => ({
        statement: item.statement,
        long_term_risk: item.longTermRisk,
        evidence_ids: item.evidenceIds,
      })),
      principle_hints: uniqueStrings(fact.principleHints, 5),
      evidence_ids: uniqueStrings(fact.evidenceIds, 12),
    })),
    boundary_flips: input.facts.boundaryFlips,
    hidden_costs: input.facts.hiddenCosts,
    must_haves: input.facts.mustHaves,
    known_rules: input.facts.knownRules.map((item) => ({
      dimension: item.dimension,
      statement: item.statement,
      evidence_ids: uniqueStrings(item.evidenceIds, 4),
    })),
    cross_dimension_patterns: input.facts.crossDimensionPatterns,
    uncertainties: input.facts.uncertainties,
    selected_user_notes: input.facts.selectedUserNotes,
    valid_evidence_ids: input.facts.evidence.map((item) => item.id),
  });
}
