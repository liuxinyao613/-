# Sol vs DeepSeek A/B Smoke Test

本轮只切换 PRODUCT AI Provider。Synthetic Persona、Question Bank、Prompt synthetic-user-v1、Evaluator deterministic-evaluator-v1 与 User Simulator 配置保持一致。样本量仅 5，不以单一总分宣布胜负。

- 两侧目标总题数：Sol 32 / DeepSeek 32
- Product Prompt：phase2-ai-v1
- Question Bank：core24-adaptive44-v1
- 共同问题的 Simulator 回答一致性：146/146（0 个不一致）

> 有效性说明：3/5 个配对 Session 在硬预算内完成。已达到预设的至少 3 个有效配对门槛；未完成样本仍按删失案例单独保留，不用总分掩盖。

- 已覆盖代表类型：条件型、Hidden Cost 型、高 UNKNOWN 型、中文口语型、表面矛盾但实际一致型
- 因 Smoke 稳定性前提失败而未扩大覆盖：无

## 自动指标对比

| 指标 | Sol xhigh | DeepSeek V4 Flash max | 绝对差 |
|---|---:|---:|---:|
| Condition Recall | 66.7% | 46.7% | 20.0% |
| Boundary Flip Recall | 40.0% | 40.0% | 0.0% |
| False Flip Rate | 16.0% | 16.0% | 0.0% |
| Hidden Cost Recall | 80.0% | 70.0% | 10.0% |
| Uncertainty Respect | 100.0% | 100.0% | 0.0% |
| Contradiction Handling | 80.0% | 80.0% | 0.0% |
| Adaptive Relevance | 100.0% | 100.0% | 0.0% |
| Repetition | 0.0% | 0.0% | 0.0% |
| Extremity Drift | 0.0% | 0.0% | 0.0% |
| Overinterpretation Rate | 0.0% | 0.0% | 0.0% |
| Evidence Grounding | 100.0% | 100.0% | 0.0% |

## Token / latency / 稳定性

| 指标 | Sol xhigh | DeepSeek V4 Flash max |
|---|---:|---:|
| 平均总题数 | 32.0 | 32.0 |
| 平均 AI 调用次数 | 49.6 | 50.0 |
| 平均 token | 145759 | 98575 |
| Interpreter latency | 12917 ms | 9627 ms |
| Planner latency | 38779 ms | 36280 ms |
| Report latency | 123817 ms | 88929 ms |
| 三个产品角色 latency 合计 | 175513 ms | 134836 ms |
| Schema / API error rate | 0.4% | 0.0% |
| Session completion | 60.0% | 100.0% |

## 每个 Persona 的主要差异

- **高度依赖情境的协商者（conditional-context）**：自动质量指标接近；主要差异需要盲看报告措辞与证据链。
- **先承受后耗尽的照顾者（hidden-cost-caregiver）**：Hidden Cost Recall 差异最大（Sol 更高 50.0%）；题数 32/32，token 132920/111565。
- **保留真实未知的人（high-unknown）**：自动质量指标接近；主要差异需要盲看报告措辞与证据链。
- **中文口语表达者（colloquial-zh）**：自动质量指标接近；主要差异需要盲看报告措辞与证据链。
- **区分授权与越权的人（surface-consistent）**：Condition Recall 差异最大（Sol 更高 100.0%）；题数 32/32，token 150621/101335。

## 两家最明显的错误案例

### Sol

- surface-consistent：ANSWER_INTERPRETER:NETWORK_OR_PROVIDER；EXPECTED_FLIP_MISSED；TOKEN_BUDGET_EXCEEDED
- colloquial-zh：EXPECTED_FLIP_MISSED；TOKEN_BUDGET_EXCEEDED；TOKEN_SOFT_WARNING

### DeepSeek

- colloquial-zh：EXPECTED_FLIP_MISSED；TOKEN_SOFT_WARNING；预设 Boundary Flip 未完全发现
- surface-consistent：EXPECTED_FLIP_MISSED；TOKEN_SOFT_WARNING；关键条件未完全识别

## DeepSeek 已接近 Sol 的任务

- Boundary Flip Recall：差 0.0%
- False Flip Rate：差 0.0%
- Uncertainty Respect：差 0.0%
- Contradiction Handling：差 0.0%
- Adaptive Relevance：差 0.0%
- Repetition：差 0.0%
- Extremity Drift：差 0.0%
- Overinterpretation Rate：差 0.0%
- Evidence Grounding：差 0.0%

## 当前差距最大的任务

- Condition Recall：差 20.0%
- Hidden Cost Recall：差 10.0%
- Boundary Flip Recall：差 0.0%
- False Flip Rate：差 0.0%

## 是否扩大到 20 Persona

值得在下一轮扩大到 20 Persona，但不建议今晚直接运行：先完成 Report A / B 人工盲看，并把 Sol 的两个 token/error 删失案例纳入预算修复。本结论只表示 DeepSeek 的接口稳定性、成本和多数自动指标具备继续测试价值。

## 人工判断说明

盲评材料位于同目录的 `HUMAN_BLIND_REVIEW.md` 与 `blind-reports/`。Provider 对应关系单独保存在 `provider-map.json`，评分前不要打开。自动指标只用于定位案例，不替代人工判断。
