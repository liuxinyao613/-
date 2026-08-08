import { adaptiveQuestionBank } from "@/data/adaptive-question-bank";
import { BoundaryDimension } from "@/lib/domain/schemas";
import {
  SyntheticRunSummarySchema,
  SYNTHETIC_EVALUATOR_VERSION,
  SYNTHETIC_PROMPT_VERSION,
  SYNTHETIC_QUESTION_BANK_VERSION,
  type SyntheticRunSummary,
  type SyntheticSessionResult,
} from "./schemas";

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function meanEvaluation(
  results: SyntheticSessionResult[],
  key: keyof SyntheticSessionResult["evaluation"],
): number {
  const values = results
    .map((item) => item.evaluation[key])
    .filter((value): value is number => typeof value === "number");
  return average(values);
}

function qualityScore(result: SyntheticSessionResult): number {
  const evaluation = result.evaluation;
  return (
    evaluation.conditionRecall +
    evaluation.boundaryFlipRecall +
    (1 - evaluation.falseFlipRate) +
    evaluation.hiddenCostRecall +
    evaluation.uncertaintyRespect +
    evaluation.contradictionHandling +
    evaluation.adaptiveRelevance +
    (1 - evaluation.repetitionRate) +
    (1 - evaluation.extremityDrift) +
    (1 - evaluation.overinterpretationRate) +
    evaluation.evidenceGrounding -
    result.anomalies.length * 0.2 -
    result.errors.length * 0.15
  );
}

export function buildSyntheticRunSummary(input: {
  runId: string;
  mode: "smoke" | "standard" | "stress" | "ab";
  productTarget: "sol" | "deepseek" | "comparison";
  results: SyntheticSessionResult[];
  startedAt: string;
  completedAt?: string;
  concurrency: number;
  targetTotal: number;
}): SyntheticRunSummary {
  const results = input.results;
  const questionCounts = results.map((item) => item.metrics.totalQuestions);
  const tokenCounts = results.map((item) => item.metrics.totalTokens);
  const averageDimensionQuestionCounts = Object.fromEntries(
    Object.values(BoundaryDimension).map((dimension) => [
      dimension,
      average(results.map((item) => item.metrics.dimensionQuestionCounts[dimension])),
    ]),
  );
  const unresolvedCounts = Object.fromEntries(
    Object.values(BoundaryDimension).map((dimension) => [
      dimension,
      results.filter((item) =>
        item.reportFacts.unresolvedDimensions.includes(dimension),
      ).length,
    ]),
  ) as Record<BoundaryDimension, number>;
  const selectedCounts = new Map<string, number>();
  results.forEach((result) => {
    result.trace
      .filter((step) => step.kind === "PLAN")
      .flatMap((step) => step.selectedQuestionIds)
      .forEach((id) => selectedCounts.set(id, (selectedCounts.get(id) ?? 0) + 1));
  });
  const mostSelectedAdaptiveQuestion =
    [...selectedCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    null;
  const rankDimensions = (values: Record<string, number>): BoundaryDimension | null => {
    const dimension = Object.entries(values).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0];
    return dimension ? (dimension as BoundaryDimension) : null;
  };
  const roleLatency = (role: SyntheticSessionResult["telemetry"][number]["role"]) =>
    average(
      results.flatMap((item) =>
        item.telemetry.filter((call) => call.role === role).map((call) => call.latencyMs),
      ),
    );
  const totalCalls = results.reduce((sum, item) => sum + item.metrics.totalAiCalls, 0);
  const failedCalls = results.reduce(
    (sum, item) => sum + item.telemetry.filter((call) => !call.success).length,
    0,
  );
  const ranked = [...results].sort((left, right) => qualityScore(right) - qualityScore(left));
  const simulatorPromptVersions = new Set(
    results.map((item) => item.promptVersion),
  );
  const productPromptVersions = new Set(
    results.map((item) => item.productPromptVersion),
  );
  if (simulatorPromptVersions.size > 1 || productPromptVersions.size > 1) {
    throw new Error("Synthetic run mixed multiple prompt versions.");
  }

  return SyntheticRunSummarySchema.parse({
    runId: input.runId,
    mode: input.mode,
    productTarget: input.productTarget,
    promptVersion:
      [...simulatorPromptVersions][0] ?? SYNTHETIC_PROMPT_VERSION,
    productPromptVersion:
      [...productPromptVersions][0] ?? "phase2-ai-v1",
    evaluatorVersion: SYNTHETIC_EVALUATOR_VERSION,
    questionBankVersion: SYNTHETIC_QUESTION_BANK_VERSION,
    personaIds: results.map((item) => item.persona.personaId),
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? new Date().toISOString(),
    concurrency: input.concurrency,
    targetTotal: input.targetTotal,
    completionRate: results.length
      ? results.filter((item) => item.metrics.testCompleted).length / results.length
      : 0,
    completed: results.filter((item) => item.metrics.testCompleted).length,
    failed: results.filter((item) => !item.metrics.testCompleted).length,
    averages: {
      totalQuestions: average(questionCounts),
      adaptiveQuestions: average(results.map((item) => item.metrics.adaptiveQuestions)),
      totalTokens: average(tokenCounts),
      totalAiCalls: average(results.map((item) => item.metrics.totalAiCalls)),
      interpreterLatencyMs: roleLatency("ANSWER_INTERPRETER"),
      plannerLatencyMs: roleLatency("PROBE_PLANNER"),
      reportLatencyMs: roleLatency("REPORT_WRITER"),
      simulatorLatencyMs: roleLatency("USER_SIMULATOR"),
      repetitionRate: meanEvaluation(results, "repetitionRate"),
      highExtremityRate: meanEvaluation(results, "extremityDrift"),
    },
    percentiles: {
      questionsP50: percentile(questionCounts, 50),
      questionsP90: percentile(questionCounts, 90),
      tokensP50: percentile(tokenCounts, 50),
      tokensP90: percentile(tokenCounts, 90),
      highestTokens: Math.max(0, ...tokenCounts),
    },
    aggregateEvaluation: {
      conditionRecall: meanEvaluation(results, "conditionRecall"),
      boundaryFlipRecall: meanEvaluation(results, "boundaryFlipRecall"),
      falseFlipRate: meanEvaluation(results, "falseFlipRate"),
      hiddenCostRecall: meanEvaluation(results, "hiddenCostRecall"),
      uncertaintyRespect: meanEvaluation(results, "uncertaintyRespect"),
      contradictionHandling: meanEvaluation(results, "contradictionHandling"),
      adaptiveRelevance: meanEvaluation(results, "adaptiveRelevance"),
      repetitionRate: meanEvaluation(results, "repetitionRate"),
      extremityDrift: meanEvaluation(results, "extremityDrift"),
      overinterpretationRate: meanEvaluation(results, "overinterpretationRate"),
      evidenceGrounding: meanEvaluation(results, "evidenceGrounding"),
    },
    averageDimensionQuestionCounts,
    mostOverprobedDimension: rankDimensions(averageDimensionQuestionCounts),
    mostUnresolvedDimension: rankDimensions(unresolvedCounts),
    mostSelectedAdaptiveQuestion,
    neverSelectedQuestionIds: adaptiveQuestionBank
      .map((item) => item.id)
      .filter((id) => !selectedCounts.has(id)),
    reachedSoftLimitRate: results.length
      ? results.filter((item) => item.metrics.totalQuestions > 45).length / results.length
      : 0,
    reachedHardLimitRate: results.length
      ? results.filter((item) => item.metrics.totalQuestions >= 50).length / results.length
      : 0,
    plannerFallbackCount: results.reduce(
      (sum, item) => sum + item.metrics.plannerFallbackCount,
      0,
    ),
    schemaOrApiErrorRate: totalCalls ? failedCalls / totalCalls : 0,
    anomalyCount: results.reduce((sum, item) => sum + item.anomalies.length, 0),
    bestSessionIds: ranked.slice(0, 3).map((item) => item.persona.personaId),
    reviewSessionIds: ranked.slice(-3).reverse().map((item) => item.persona.personaId),
  });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function syntheticSummaryMarkdown(
  summary: SyntheticRunSummary,
  results: SyntheticSessionResult[],
): string {
  const anomalyCounts = new Map<string, number>();
  results.flatMap((item) => item.anomalies).forEach((item) => {
    anomalyCounts.set(item, (anomalyCounts.get(item) ?? 0) + 1);
  });
  const mainIssues = [...anomalyCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);
  const humanFocus = [
    "确认用户口语中的“可以但难受”是否被稳定区分为接受与不可持续。",
    "观察表面矛盾是否会触发不必要的 CONTRADICTION_RESOLUTION。",
    "检查 UNKNOWN 在 2–3 次合理探索后是否停止继续追问。",
    "核对 Adaptive 题是否围绕 Planner 意图，而不是只偏向固定高频维度。",
    "逐条打开最终报告 Evidence，确认跨维度归纳没有越过原始回答。",
  ];
  const dimensionRows = Object.values(BoundaryDimension)
    .map(
      (dimension) =>
        `| ${dimension} | ${summary.averageDimensionQuestionCounts[dimension].toFixed(2)} |`,
    )
    .join("\n");
  return `# Synthetic Test Summary

- Run ID：${summary.runId}
- Mode：${summary.mode}
- Product：${summary.productTarget}
- User Simulator Prompt：${summary.promptVersion}
- Product Prompt：${summary.productPromptVersion}
- Evaluator：${summary.evaluatorVersion}
- Question Bank：${summary.questionBankVersion}
- 运行 Persona 数：${summary.personaIds.length}
- 完成率：${percent(summary.completionRate)}
- 成功完成：${summary.completed}
- 失败：${summary.failed}
- 平均题数：${summary.averages.totalQuestions.toFixed(1)}
- 平均 Adaptive 题数：${summary.averages.adaptiveQuestions.toFixed(1)}
- 平均 token / user：${Math.round(summary.averages.totalTokens)}
- 最高 token：${Math.round(summary.percentiles.highestTokens)}
- 平均模型调用：${summary.averages.totalAiCalls.toFixed(1)}
- Boundary Flip Recall：${percent(summary.aggregateEvaluation.boundaryFlipRecall)}
- False Flip Rate：${percent(summary.aggregateEvaluation.falseFlipRate)}
- Hidden Cost Recall：${percent(summary.aggregateEvaluation.hiddenCostRecall)}
- Condition Recall：${percent(summary.aggregateEvaluation.conditionRecall)}
- Uncertainty Respect：${percent(summary.aggregateEvaluation.uncertaintyRespect)}
- Contradiction Handling：${percent(summary.aggregateEvaluation.contradictionHandling)}
- Overinterpretation Rate：${percent(summary.aggregateEvaluation.overinterpretationRate)}
- Evidence Grounding：${percent(summary.aggregateEvaluation.evidenceGrounding)}
- 达到题量软上限人数：${results.filter((item) => item.metrics.totalQuestions > 45).length}
- 达到题量硬上限人数：${results.filter((item) => item.metrics.totalQuestions >= 50).length}
- 超过 token soft warning 人数：${results.filter((item) => item.metrics.totalTokens >= 100_000).length}
- 达到 token hard budget 人数：${results.filter((item) => item.metrics.totalTokens >= 150_000).length}
- Planner fallback：${summary.plannerFallbackCount}
- Schema / API error rate：${percent(summary.schemaOrApiErrorRate)}

## 主要问题

${mainIssues.length ? mainIssues.map(([name, count]) => `- ${name}：${count}`).join("\n") : "- 没有自动异常。"}

## 真人测试最值得关注的 5 个问题

${humanFocus.map((item) => `- ${item}`).join("\n")}

## 表现最好的 Synthetic Session

${summary.bestSessionIds.map((item) => `- ${item}`).join("\n") || "- 无"}

## 最需要人工检查的 Synthetic Session

${summary.reviewSessionIds.map((item) => `- ${item}`).join("\n") || "- 无"}

## 补充统计

- 题数 P50 / P90：${summary.percentiles.questionsP50} / ${summary.percentiles.questionsP90}
- Token P50 / P90：${Math.round(summary.percentiles.tokensP50)} / ${Math.round(summary.percentiles.tokensP90)}
- Interpreter 平均 latency：${Math.round(summary.averages.interpreterLatencyMs)} ms
- Planner 平均 latency：${Math.round(summary.averages.plannerLatencyMs)} ms
- Report 平均 latency：${Math.round(summary.averages.reportLatencyMs)} ms
- Adaptive Relevance：${percent(summary.aggregateEvaluation.adaptiveRelevance)}
- 语义重复率：${percent(summary.aggregateEvaluation.repetitionRate)}
- Extremity 4–5 比例：${percent(summary.averages.highExtremityRate)}
- Extremity Drift：${percent(summary.aggregateEvaluation.extremityDrift)}
- 最容易过度追问维度：${summary.mostOverprobedDimension ?? "无"}
- 最容易 unresolved 维度：${summary.mostUnresolvedDimension ?? "无"}
- 最常选 Adaptive Question：${summary.mostSelectedAdaptiveQuestion ?? "无"}
- 从未选择题目数：${summary.neverSelectedQuestionIds.length}
- 从未选择题目：${summary.neverSelectedQuestionIds.join("、") || "无"}

## 每维平均题数

| 维度 | 平均题数 |
|---|---:|
${dimensionRows}
`;
}
