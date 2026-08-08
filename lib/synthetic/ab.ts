import path from "node:path";
import type { StructuredReport } from "@/lib/domain/schemas";
import type {
  SyntheticRunSummary,
  SyntheticSessionResult,
} from "./schemas";
import { writeSyntheticArtifact } from "./persistence";

type EvaluationKey = keyof SyntheticRunSummary["aggregateEvaluation"];

const evaluationLabels: Record<EvaluationKey, string> = {
  conditionRecall: "Condition Recall",
  boundaryFlipRecall: "Boundary Flip Recall",
  falseFlipRate: "False Flip Rate",
  hiddenCostRecall: "Hidden Cost Recall",
  uncertaintyRespect: "Uncertainty Respect",
  contradictionHandling: "Contradiction Handling",
  adaptiveRelevance: "Adaptive Relevance",
  repetitionRate: "Repetition",
  extremityDrift: "Extremity Drift",
  overinterpretationRate: "Overinterpretation Rate",
  evidenceGrounding: "Evidence Grounding",
};

const lowerIsBetter = new Set<EvaluationKey>([
  "falseFlipRate",
  "repetitionRate",
  "extremityDrift",
  "overinterpretationRate",
]);

const evaluationKeys = Object.keys(evaluationLabels) as EvaluationKey[];

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function number(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : "—";
}

function reportMarkdown(report: StructuredReport): string {
  const evidence = report.evidencePanels.flatMap((panel) =>
    panel.items.map(
      (item) =>
        `- ${item.question}｜${item.answer}${item.note ? `｜“${item.note}”` : ""}`,
    ),
  );
  return `# ${report.title}

${report.headline}

## 一句话画像

${report.snapshot}

## 核心原则

${report.corePrinciples
  .map((item) => `- ${item.title}：${item.description}`)
  .join("\n") || "- 无"}

## Boundary Flips

${report.boundaryFlips
  .map((item) => `- ${item.from} → ${item.to}；触发：${item.trigger}`)
  .join("\n") || "- 无"}

## Must Have

${report.mustHaves.map((item) => `- ${item.statement}`).join("\n") || "- 无"}

## Hidden Cost

${report.hiddenCosts
  .map((item) => `- ${item.statement}；长期风险：${item.longTermRisk}`)
  .join("\n") || "- 无"}

## 未确定区域

${report.unresolvedAreas.map((item) => `- ${item.prompt}`).join("\n") || "- 无"}

## 为什么这么说

${evidence.join("\n") || "- 无证据条目"}
`;
}

function stableSwap(personaId: string): boolean {
  return [...personaId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 === 0;
}

function resultByPersona(results: SyntheticSessionResult[]) {
  return new Map(results.map((item) => [item.persona.personaId, item]));
}

function primaryDifference(
  sol: SyntheticSessionResult,
  deepseek: SyntheticSessionResult,
): string {
  const ranked = evaluationKeys
    .map((key) => ({
      key,
      difference: deepseek.evaluation[key] - sol.evaluation[key],
    }))
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference));
  const primary = ranked[0];
  if (!primary || Math.abs(primary.difference) < 0.01) {
    return "自动质量指标接近；主要差异需要盲看报告措辞与证据链。";
  }
  const direction = lowerIsBetter.has(primary.key)
    ? primary.difference < 0
      ? "DeepSeek 更低"
      : "Sol 更低"
    : primary.difference > 0
      ? "DeepSeek 更高"
      : "Sol 更高";
  return `${evaluationLabels[primary.key]} 差异最大（${direction} ${percent(Math.abs(primary.difference))}）；题数 ${sol.metrics.totalQuestions}/${deepseek.metrics.totalQuestions}，token ${sol.metrics.totalTokens}/${deepseek.metrics.totalTokens}。`;
}

function errorCase(result: SyntheticSessionResult): string {
  const details = [
    ...result.errors.map((item) => `${item.stage}:${item.type}`),
    ...result.evaluation.errorCases,
    ...result.anomalies,
  ];
  return details.slice(0, 3).join("；") || "未发现自动异常";
}

export function solVsDeepSeekMarkdown(input: {
  solSummary: SyntheticRunSummary;
  deepseekSummary: SyntheticRunSummary;
  solResults: SyntheticSessionResult[];
  deepseekResults: SyntheticSessionResult[];
}): string {
  const solByPersona = resultByPersona(input.solResults);
  const deepseekByPersona = resultByPersona(input.deepseekResults);
  const personaIds = input.solSummary.personaIds.filter((id) => deepseekByPersona.has(id));
  const coveredArchetypes = new Set(
    personaIds.flatMap((id) => solByPersona.get(id)?.persona.archetypes ?? []),
  );
  const representativeCoverage = [
    ["CONDITIONAL", "条件型"],
    ["HIDDEN_COST", "Hidden Cost 型"],
    ["HIGH_UNKNOWN", "高 UNKNOWN 型"],
    ["COLLOQUIAL_ZH", "中文口语型"],
    ["SURFACE_CONSISTENT", "表面矛盾但实际一致型"],
  ] as const;
  const coveredLabels = representativeCoverage
    .filter(([key]) => coveredArchetypes.has(key))
    .map(([, label]) => label);
  const missingLabels = representativeCoverage
    .filter(([key]) => !coveredArchetypes.has(key))
    .map(([, label]) => label);
  const comparisons = evaluationKeys.map((key) => {
    const sol = input.solSummary.aggregateEvaluation[key];
    const deepseek = input.deepseekSummary.aggregateEvaluation[key];
    return { key, sol, deepseek, gap: Math.abs(deepseek - sol) };
  });
  const close = comparisons.filter((item) => item.gap <= 0.08);
  const gaps = [...comparisons].sort((left, right) => right.gap - left.gap).slice(0, 4);
  const deepseekHealthy =
    input.deepseekSummary.completionRate >= 0.8 &&
    input.deepseekSummary.schemaOrApiErrorRate <= 0.05;
  const pairedCompleted = personaIds.filter((id) => {
    const sol = solByPersona.get(id);
    const deepseek = deepseekByPersona.get(id);
    return sol?.metrics.testCompleted && deepseek?.metrics.testCompleted;
  }).length;
  const comparisonValid = pairedCompleted === personaIds.length && personaIds.length > 0;
  const expand =
    comparisonValid &&
    deepseekHealthy &&
    comparisons.filter((item) => item.gap <= 0.1).length >= 7;
  const latency = (summary: SyntheticRunSummary) =>
    summary.averages.interpreterLatencyMs +
    summary.averages.plannerLatencyMs +
    summary.averages.reportLatencyMs;

  return `# Sol vs DeepSeek A/B Smoke Test

本轮只切换 PRODUCT AI Provider。Synthetic Persona、Question Bank、Prompt ${input.solSummary.promptVersion}、Evaluator ${input.solSummary.evaluatorVersion} 与 User Simulator 配置保持一致。样本量仅 ${personaIds.length}，不以单一总分宣布胜负。

> 有效性警告：${comparisonValid ? `${pairedCompleted}/${personaIds.length} 个配对 Session 都在硬预算内完成。` : `只有 ${pairedCompleted}/${personaIds.length} 个配对 Session 在硬预算内完成；以下指标含提前终止或 fallback 报告，只能用于定位问题，不能用于模型胜负判断。`}

- 已覆盖代表类型：${coveredLabels.join("、") || "无"}
- 因 Smoke 稳定性前提失败而未扩大覆盖：${missingLabels.join("、") || "无"}

## 自动指标对比

| 指标 | Sol xhigh | DeepSeek V4 Flash max | 绝对差 |
|---|---:|---:|---:|
${comparisons.map((item) => `| ${evaluationLabels[item.key]} | ${percent(item.sol)} | ${percent(item.deepseek)} | ${percent(item.gap)} |`).join("\n")}

## Token / latency / 稳定性

| 指标 | Sol xhigh | DeepSeek V4 Flash max |
|---|---:|---:|
| 平均总题数 | ${number(input.solSummary.averages.totalQuestions)} | ${number(input.deepseekSummary.averages.totalQuestions)} |
| 平均 AI 调用次数 | ${number(input.solSummary.averages.totalAiCalls)} | ${number(input.deepseekSummary.averages.totalAiCalls)} |
| 平均 token | ${Math.round(input.solSummary.averages.totalTokens)} | ${Math.round(input.deepseekSummary.averages.totalTokens)} |
| Interpreter latency | ${Math.round(input.solSummary.averages.interpreterLatencyMs)} ms | ${Math.round(input.deepseekSummary.averages.interpreterLatencyMs)} ms |
| Planner latency | ${Math.round(input.solSummary.averages.plannerLatencyMs)} ms | ${Math.round(input.deepseekSummary.averages.plannerLatencyMs)} ms |
| Report latency | ${Math.round(input.solSummary.averages.reportLatencyMs)} ms | ${Math.round(input.deepseekSummary.averages.reportLatencyMs)} ms |
| 三个产品角色 latency 合计 | ${Math.round(latency(input.solSummary))} ms | ${Math.round(latency(input.deepseekSummary))} ms |
| Schema / API error rate | ${percent(input.solSummary.schemaOrApiErrorRate)} | ${percent(input.deepseekSummary.schemaOrApiErrorRate)} |
| Session completion | ${percent(input.solSummary.completionRate)} | ${percent(input.deepseekSummary.completionRate)} |

## 每个 Persona 的主要差异

${personaIds
  .map((id) => {
    const sol = solByPersona.get(id);
    const deepseek = deepseekByPersona.get(id);
    return sol && deepseek ? `- **${sol.persona.name}（${id}）**：${primaryDifference(sol, deepseek)}` : `- ${id}：缺少成对结果。`;
  })
  .join("\n")}

## 两家最明显的错误案例

### Sol

${[...input.solResults]
  .sort((left, right) => right.errors.length + right.anomalies.length - left.errors.length - left.anomalies.length)
  .slice(0, 2)
  .map((item) => `- ${item.persona.personaId}：${errorCase(item)}`)
  .join("\n")}

### DeepSeek

${[...input.deepseekResults]
  .sort((left, right) => right.errors.length + right.anomalies.length - left.errors.length - left.anomalies.length)
  .slice(0, 2)
  .map((item) => `- ${item.persona.personaId}：${errorCase(item)}`)
  .join("\n")}

## DeepSeek 已接近 Sol 的任务

${close.length ? close.map((item) => `- ${evaluationLabels[item.key]}：差 ${percent(item.gap)}`).join("\n") : "- 当前自动指标中没有差距小于等于 8% 的项目。"}

## 当前差距最大的任务

${gaps.map((item) => `- ${evaluationLabels[item.key]}：差 ${percent(item.gap)}`).join("\n")}

## 是否扩大到 20 Persona

${expand
  ? "建议进入下一轮 20 Persona，但仍需先完成 Report A / B 人工盲看；本结论只表示接口稳定性与多数自动指标具备继续测试价值。"
  : "暂不建议直接扩大。优先解决硬 token 预算下无法形成有效配对的问题，并检查 DeepSeek 的接口/schema 错误、差距最大的任务和 Report A / B 证据链，再决定是否重跑 5 人或进入 20 人。"}

## 人工判断说明

盲评材料位于同目录的 \`HUMAN_BLIND_REVIEW.md\` 与 \`blind-reports/\`。Provider 对应关系单独保存在 \`provider-map.json\`，评分前不要打开。自动指标只用于定位案例，不替代人工判断。
`;
}

export async function persistAbArtifacts(input: {
  abRunId: string;
  solSummary: SyntheticRunSummary;
  deepseekSummary: SyntheticRunSummary;
  solResults: SyntheticSessionResult[];
  deepseekResults: SyntheticSessionResult[];
}): Promise<{ summaryPath: string; reviewPath: string }> {
  const root = path.join("ab", input.abRunId);
  const solByPersona = resultByPersona(input.solResults);
  const deepseekByPersona = resultByPersona(input.deepseekResults);
  const providerMap: Record<string, { A: string; B: string }> = {};
  const reviewSections: string[] = [];

  for (const personaId of input.solSummary.personaIds) {
    const sol = solByPersona.get(personaId);
    const deepseek = deepseekByPersona.get(personaId);
    if (!sol || !deepseek) continue;
    const swap = stableSwap(personaId);
    const reportA = swap ? deepseek : sol;
    const reportB = swap ? sol : deepseek;
    providerMap[personaId] = {
      A: reportA.productTarget,
      B: reportB.productTarget,
    };
    await writeSyntheticArtifact(
      path.join(root, "blind-reports", personaId, "Report A.md"),
      reportMarkdown(reportA.structuredReport),
    );
    await writeSyntheticArtifact(
      path.join(root, "blind-reports", personaId, "Report B.md"),
      reportMarkdown(reportB.structuredReport),
    );
    reviewSections.push(`## ${sol.persona.name}（${personaId}）

- [ ] 已阅读 Report A
- [ ] 已阅读 Report B
- Condition / Flip 表达：A __ / B __
- Hidden Cost 与不确定性：A __ / B __
- 证据扎根：A __ / B __
- 语言自然度：A __ / B __
- 更可信的报告：A / B / 接近
- 备注：
`);
  }

  const review = `# Human Blind Review

请先阅读各 Persona 的 Report A 与 Report B，再填写本文件。这里故意不标注 Provider；完成评分前不要打开 provider-map.json。

${reviewSections.join("\n")}`;
  const summary = solVsDeepSeekMarkdown(input);
  await writeSyntheticArtifact(
    path.join(root, "provider-map.json"),
    `${JSON.stringify(providerMap, null, 2)}\n`,
  );
  const reviewPath = await writeSyntheticArtifact(
    path.join(root, "HUMAN_BLIND_REVIEW.md"),
    review,
  );
  const summaryPath = await writeSyntheticArtifact(
    path.join(root, "SOL_VS_DEEPSEEK_AB_SUMMARY.md"),
    summary,
  );
  await writeSyntheticArtifact("SOL_VS_DEEPSEEK_AB_SUMMARY.md", summary);
  return { summaryPath, reviewPath };
}
