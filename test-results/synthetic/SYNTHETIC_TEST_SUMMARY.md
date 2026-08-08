# Synthetic Test Summary

- Run ID：2026-08-08T17-59-12-086Z_smoke_sol
- Mode：smoke
- Product：sol
- Prompt：synthetic-user-v1
- Evaluator：deterministic-evaluator-v1
- 运行 Persona 数：3
- 成功完成：0
- 失败：3
- 平均题数：25.7
- 平均 Adaptive 题数：1.7
- 平均 token / user：152407
- 最高 token：154106
- 平均模型调用：48.7
- Boundary Flip Recall：33.3%
- Hidden Cost Recall：66.7%
- Condition Recall：88.9%
- Uncertainty Respect：100.0%
- Overinterpretation Rate：0.0%
- Evidence Grounding：100.0%
- 达到题量软上限人数：0
- 达到题量硬上限人数：0
- 超过 token soft warning 人数：3
- 达到 token hard budget 人数：3
- Planner fallback：0
- Schema / API error rate：0.7%

## 主要问题

- TOKEN_BUDGET_EXCEEDED：3
- TOKEN_SOFT_WARNING：3
- EXPECTED_FLIP_MISSED：2
- SIMULATOR_FALLBACK_USED：1

## 真人测试最值得关注的 5 个问题

- 确认用户口语中的“可以但难受”是否被稳定区分为接受与不可持续。
- 观察表面矛盾是否会触发不必要的 CONTRADICTION_RESOLUTION。
- 检查 UNKNOWN 在 2–3 次合理探索后是否停止继续追问。
- 核对 Adaptive 题是否围绕 Planner 意图，而不是只偏向固定高频维度。
- 逐条打开最终报告 Evidence，确认跨维度归纳没有越过原始回答。

## 表现最好的 Synthetic Session

- high-unknown
- conditional-context
- hidden-cost-caregiver

## 最需要人工检查的 Synthetic Session

- hidden-cost-caregiver
- conditional-context
- high-unknown

## 补充统计

- 题数 P50 / P90：26 / 27
- Token P50 / P90：153006 / 154106
- Interpreter 平均 latency：15693 ms
- Planner 平均 latency：41805 ms
- Report 平均 latency：0 ms
- Adaptive Relevance：66.7%
- Repetition：0.0%
- Extremity Drift：0.0%
- 最容易过度追问维度：PRIVACY_PERSONAL_SPACE
- 最容易 unresolved 维度：SACRIFICE_SHARED_BURDEN
- 最常选 Adaptive Question：bank-repair-01
- 从未选择题目数：38
