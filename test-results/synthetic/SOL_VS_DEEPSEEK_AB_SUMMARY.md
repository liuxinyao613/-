# Sol vs DeepSeek A/B Smoke Test

本轮只切换 PRODUCT AI Provider。Synthetic Persona、Question Bank、Prompt synthetic-user-v1、Evaluator deterministic-evaluator-v1 与 User Simulator 配置保持一致。样本量仅 3，不以单一总分宣布胜负。

> 有效性警告：只有 0/3 个配对 Session 在硬预算内完成；以下指标含提前终止或 fallback 报告，只能用于定位问题，不能用于模型胜负判断。

- 已覆盖代表类型：条件型、Hidden Cost 型、高 UNKNOWN 型
- 因 Smoke 稳定性前提失败而未扩大覆盖：中文口语型、表面矛盾但实际一致型

## 自动指标对比

| 指标 | Sol xhigh | DeepSeek V4 Flash max | 绝对差 |
|---|---:|---:|---:|
| Condition Recall | 88.9% | 66.7% | 22.2% |
| Boundary Flip Recall | 33.3% | 33.3% | 0.0% |
| False Flip Rate | 33.3% | 33.3% | 0.0% |
| Hidden Cost Recall | 66.7% | 83.3% | 16.7% |
| Uncertainty Respect | 100.0% | 77.8% | 22.2% |
| Contradiction Handling | 100.0% | 100.0% | 0.0% |
| Adaptive Relevance | 66.7% | 100.0% | 33.3% |
| Repetition | 0.0% | 0.0% | 0.0% |
| Extremity Drift | 0.0% | 0.0% | 0.0% |
| Overinterpretation Rate | 0.0% | 0.0% | 0.0% |
| Evidence Grounding | 100.0% | 100.0% | 0.0% |

## Token / latency / 稳定性

| 指标 | Sol xhigh | DeepSeek V4 Flash max |
|---|---:|---:|
| 平均总题数 | 25.7 | 39.0 |
| 平均 AI 调用次数 | 48.7 | 78.3 |
| 平均 token | 152407 | 179433 |
| Interpreter latency | 15693 ms | 11640 ms |
| Planner latency | 41805 ms | 37106 ms |
| Report latency | 0 ms | 74780 ms |
| 三个产品角色 latency 合计 | 57498 ms | 123526 ms |
| Schema / API error rate | 0.7% | 1.7% |
| Session completion | 0.0% | 0.0% |

## 每个 Persona 的主要差异

- **高度依赖情境的协商者（conditional-context）**：Adaptive Relevance 差异最大（DeepSeek 更高 100.0%）；题数 24/39，token 150110/178866。
- **先承受后耗尽的照顾者（hidden-cost-caregiver）**：Hidden Cost Recall 差异最大（DeepSeek 更高 50.0%）；题数 27/39，token 154106/199201。
- **保留真实未知的人（high-unknown）**：Uncertainty Respect 差异最大（Sol 更高 66.7%）；题数 26/39，token 153006/160232。

## 两家最明显的错误案例

### Sol

- hidden-cost-caregiver：USER_SIMULATOR:SIMULATOR_API_ERROR；预设 Boundary Flip 未完全发现；Hidden Cost 未完全识别
- conditional-context：关键条件未完全识别；预设 Boundary Flip 未完全发现；EXPECTED_FLIP_MISSED

### DeepSeek

- high-unknown：PROBE_PLANNER:NETWORK_OR_PROVIDER；PROBE_PLANNER:NETWORK_OR_PROVIDER；真实 UNKNOWN 未完全保留
- hidden-cost-caregiver：PROBE_PLANNER:NETWORK_OR_PROVIDER；REPORT_WRITER:INVALID_JSON；预设 Boundary Flip 未完全发现

## DeepSeek 已接近 Sol 的任务

- Boundary Flip Recall：差 0.0%
- False Flip Rate：差 0.0%
- Contradiction Handling：差 0.0%
- Repetition：差 0.0%
- Extremity Drift：差 0.0%
- Overinterpretation Rate：差 0.0%
- Evidence Grounding：差 0.0%

## 当前差距最大的任务

- Adaptive Relevance：差 33.3%
- Condition Recall：差 22.2%
- Uncertainty Respect：差 22.2%
- Hidden Cost Recall：差 16.7%

## 是否扩大到 20 Persona

暂不建议直接扩大。优先解决硬 token 预算下无法形成有效配对的问题，并检查 DeepSeek 的接口/schema 错误、差距最大的任务和 Report A / B 证据链，再决定是否重跑 5 人或进入 20 人。

## 人工判断说明

盲评材料位于同目录的 `HUMAN_BLIND_REVIEW.md` 与 `blind-reports/`。Provider 对应关系单独保存在 `provider-map.json`，评分前不要打开。自动指标只用于定位案例，不替代人工判断。
