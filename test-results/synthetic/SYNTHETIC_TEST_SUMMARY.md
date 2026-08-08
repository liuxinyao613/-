# Synthetic Test Summary

- Run ID：2026-08-08T20-41-07-820Z_standard_sol
- Mode：standard
- Product：sol
- User Simulator Prompt：synthetic-user-v2
- Product Prompt：phase2-ai-v2
- Evaluator：deterministic-evaluator-v1
- Question Bank：core24-adaptive44-v1
- 运行 Persona 数：20
- 完成率：95.0%
- 成功完成：19
- 失败：1
- 平均题数：32.0
- 平均 Adaptive 题数：8.0
- 平均 token / user：97398
- 最高 token：150454
- 平均模型调用：43.1
- Boundary Flip Recall：50.0%
- False Flip Rate：12.8%
- Hidden Cost Recall：60.0%
- Condition Recall：63.3%
- Uncertainty Respect：100.0%
- Contradiction Handling：65.0%
- Overinterpretation Rate：0.0%
- Evidence Grounding：100.0%
- 达到题量软上限人数：0
- 达到题量硬上限人数：0
- 超过 token soft warning 人数：6
- 达到 token hard budget 人数：1
- Planner fallback：3
- Schema / API error rate：0.3%

## 主要问题

- EXPECTED_FLIP_MISSED：10
- TOKEN_SOFT_WARNING：6
- GROUND_TRUTH_REPORT_CONTRADICTION：2
- SIMULATOR_FALLBACK_USED：2
- TOKEN_BUDGET_EXCEEDED：1
- UNKNOWN_OVERPROBED：1

## 真人测试最值得关注的 5 个问题

- 确认用户口语中的“可以但难受”是否被稳定区分为接受与不可持续。
- 观察表面矛盾是否会触发不必要的 CONTRADICTION_RESOLUTION。
- 检查 UNKNOWN 在 2–3 次合理探索后是否停止继续追问。
- 核对 Adaptive 题是否围绕 Planner 意图，而不是只偏向固定高频维度。
- 逐条打开最终报告 Evidence，确认跨维度归纳没有越过原始回答。

## 表现最好的 Synthetic Session

- minimalist
- high-unknown
- commitment-flexible

## 最需要人工检查的 Synthetic Session

- intimacy-space
- hidden-cost-caregiver
- surface-consistent

## 补充统计

- 题数 P50 / P90：32 / 32
- Token P50 / P90：84228 / 137711
- Interpreter 平均 latency：13997 ms
- Planner 平均 latency：28750 ms
- Report 平均 latency：106949 ms
- Adaptive Relevance：100.0%
- 语义重复率：0.0%
- Extremity 4–5 比例：0.0%
- Extremity Drift：0.0%
- 最容易过度追问维度：PRIVACY_PERSONAL_SPACE
- 最容易 unresolved 维度：SACRIFICE_SHARED_BURDEN
- 最常选 Adaptive Question：bank-privacy-01
- 从未选择题目数：0
- 从未选择题目：无

## 每维平均题数

| 维度 | 平均题数 |
|---|---:|
| AUTONOMY_CONTROL | 2.95 |
| HONESTY_AUTHENTICITY | 2.55 |
| PRIVACY_PERSONAL_SPACE | 4.30 |
| LOYALTY_EXCLUSIVITY | 2.40 |
| RELATIONSHIP_PRIORITY | 2.75 |
| SACRIFICE_SHARED_BURDEN | 3.00 |
| CONFLICT_DIGNITY | 3.65 |
| RESPONSIBILITY_FAIRNESS | 2.55 |
| FORGIVENESS_REPAIR_TRUST | 3.05 |
| COMMITMENT_FUTURE_STRUCTURE | 2.45 |
| EMOTIONAL_INTIMACY_NEEDS | 2.35 |
