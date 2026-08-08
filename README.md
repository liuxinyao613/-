# Relationship Boundary Map — Phase 2

一个从测试前教学、Core-24、AI 答案解释、固定题库自适应追问到 Evidence-backed 结构化报告的 Web/PWA 原型。

这不是心理测试或人格测试。产品描述的是具体关系情境中的接受边界、决定条件、长期可持续性、Hidden Cost、Boundary Flip 与真实未知；不提供总分、健康度、人格类型或匹配百分比。

## 当前闭环

```text
用户按钮选择 + 补充短句
  → RawResponse 先追加保存
  → 服务端 Answer Interpreter（按策略调用）
  → Zod 校验 + normalize
  → 纯 sessionReducer 合并 Evidence / Condition / Hidden Cost / Flip
  → Core-24 完成
  → 服务端 Probe Planner 返回最多 3 个 ProbeIntent
  → 程序应用 cooldown / 去重 / extremity 限制 / 评分
  → 从 44 题固定 Adaptive Question Bank 选题
  → 程序生成 ReportFacts
  → 服务端 Report Writer
  → Zod 校验、Evidence ID 过滤、现有报告 UI 渲染
```

原始回答永远先写入 `localStorage`，模型没有修改应用状态的入口。模型失败时，RawResponse 和原文仍然保留。

## 已实现

- Phase 1 的教学页、单题沉浸交互、四个中性答案、动态 placeholder、跳过、进度、PWA 与追加式 RawResponse 历史
- 11 个核心维度与完整 Phase 2 Zod 数据模型
- OpenAI-compatible 服务端 Provider；`OpenAIProvider`、`DeepSeekProvider`、`MockProvider` 共用同一接口
- 按需 Answer Interpreter：有补充短句、`DEPENDS` 或 `UNKNOWN` 时调用；纯 `ACCEPT / REJECT` 且无短句时只建基础 Evidence
- 原始按钮语义锁定：AI 只能增加 discomfort、sustainability、conditions、exit signal 等第二层语义
- 44 道固定 Adaptive 题，每题含维度、场景标签、变量、极端度和语义键元数据
- Probe Planner 只产出意图，不产出题目文本；AI Question Generator 在 Phase 2 明确禁用
- 程序选题：维度 cooldown、已问题过滤、语义近重复过滤、极端度限制和候选评分
- Adaptive 最少 8 题、默认目标总题数 38、软上限 45、硬上限 50
- 程序化 `ReportFacts` 与 AI `StructuredReport`，重要结论必须带 `evidenceIds`
- Report Writer 失败时渲染 Facts fallback，并提供“重新生成 AI 报告”
- 开发环境 `/debug/ai`：调用数、角色、模型、token、latency、成功/错误；生产环境返回 404
- Phase 1 `session.v1` 到 Phase 2 `session.v2` 的本地迁移

## 技术栈

- vinext（Next.js App Router API 兼容）+ React 19
- TypeScript 5、Zod 4、Tailwind CSS 4
- 服务端 Route Handlers：`/api/ai/interpret`、`/api/ai/plan`、`/api/ai/report`
- Cloudflare Worker 兼容构建
- Node.js `>= 22.13.0`

## Windows 本地启动

在 PowerShell 中：

```powershell
cd "C:\Users\liuxingyao\Desktop\人格边界测试"
npm install
Copy-Item .env.example .env.local
```

编辑 `.env.local`：

```dotenv
AI_BASE_URL=https://your-openai-compatible-host.example/v1
AI_API_KEY=your-server-side-key
AI_MODEL=your-model-name
AI_REASONING_EFFORT=xhigh
```

然后启动：

```powershell
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。开发调试页位于 [http://localhost:3000/debug/ai](http://localhost:3000/debug/ai)。修改环境变量后需要重启开发服务器。

`AI_API_KEY` 只由服务端模块读取，不使用 `NEXT_PUBLIC_` 前缀，也不会进入客户端请求体。`AI_BASE_URL` 可以是带 `/v1` 的根地址，也可以直接是 `/chat/completions` 地址。Provider 会发送 JSON Schema Structured Output；中转服务需要兼容该请求格式。运行时代码没有写死模型名称。

没有配置 Key 或模型时，测试仍能跑完：Interpreter 保留基础 Evidence，Planner 使用确定性选题，Report Writer 使用 Facts fallback。

## 验证命令

```powershell
npm run lint
npm run typecheck
npm run test:domain
npm run build
npm test
```

生产构建后本地启动：

```powershell
npm run start
```

## 项目结构

```text
app/
  api/ai/interpret/             # Answer Interpreter 服务端边界
  api/ai/plan/                  # Probe Planner 服务端边界
  api/ai/report/                # Report Writer 服务端边界
  assessment/                   # Core + Adaptive 单题流程
  report/                       # StructuredReport / fallback 共用 UI
  debug/ai/                     # 仅开发环境可见的 telemetry
data/
  core-24.ts                    # 24 道固定核心题
  adaptive-question-bank.ts     # 44 道固定自适应题
  mock-probes.ts                # 仅用于兼容 Phase 1 已存 Session
  questions.ts                  # 题目索引与数据不变量
lib/
  ai/
    contracts.ts                # Interpreter / Planner / Report Zod contracts
    config.ts                   # 服务端环境变量
    normalization.ts            # usage 与 provider response 兼容归一
    prompts.ts                  # 三个 AI role 的约束提示
    provider.ts                 # AIProvider interface 与错误类型
    server.ts                   # Route Handler 使用的 Provider factory
    providers/                  # OpenAI-compatible / DeepSeek / Mock
  adaptive/flow.ts              # fallback planner、题库评分、cooldown、停止规则
  domain/
    schemas.ts                  # 核心 enum、Session、ReportFacts、telemetry
    derive.ts                   # 从最新原始回答和 Evidence 派生 BoundaryState
  report/
    build-report.ts             # 纯程序 ReportFacts 与 fallback 报告
    normalize-ai-report.ts      # AI 报告 Evidence ID 白名单与 UI 合并
  session/
    reducer.ts                  # 唯一 Session 状态合并入口
    storage.ts                  # localStorage v2 与 v1 迁移
tests/
  domain.test.ts                # schema、解释器不变量、自适应与完整闭环
  rendered-html.test.mjs        # 构建产物路由烟雾测试
```

## 关键 Schema

`AnswerInterpretationPayloadSchema`：

```text
acceptance, discomfort, sustainability, conditional, conditions,
relationshipStateChange, exitSignal, principleHints, semanticConflict,
requiresFollowup, followupReason, summary, sourceQuote, confidence
```

normalize 层会强制把 `acceptance` 恢复为原始按钮对应值，并只接受确实出现在本次 note 里的 `sourceQuote`。

`ProbeIntentSchema`：

```text
dimension, probeType, targetVariable, informationGoal, fixedVariables,
desiredChange, preferredTags, desiredExtremity, priority
```

`probeType` 仅允许 `CONDITION_CLARIFICATION`、`BOUNDARY_LADDER`、`SINGLE_VARIABLE`、`CROSS_CONTEXT_VALIDATION`、`CONTRADICTION_RESOLUTION`、`HIDDEN_COST_PROBE`、`UNCERTAINTY_PROBE`。

`ReportWriterPayloadSchema` 输出 `headline`、`overview`、`corePrinciples`、`dimensions`、`boundaryFlips`、`mustHaves`、`hiddenCosts`、`tensions`、`uncertainties`、`shareLine`；每个重要结论的 Evidence ID 会再次由程序按本次 Session 白名单过滤。

## 错误降级与数据边界

- Interpreter 失败：RawResponse 已先保存，直接 Evidence 仍然有效。
- Planner 失败或输出不可用：程序根据未确定状态、Hidden Cost、条件和 Evidence 覆盖选择固定题库。
- Report Writer 失败：纯程序使用同一份 ReportFacts 生成基础报告，可手动重试。
- `UNKNOWN` 保持 `UNRESOLVED / UNCERTAIN`，不参与中间值计算。
- 本地存储键为 `relationship-boundary-map.session.v2`；旧 v1 数据仅迁移，不覆盖。

## Phase 2 明确未实现

- AI 自由生成新问题；`QUESTION_GENERATOR` 只保留接口和 telemetry enum
- 情侣模式、匹配、账号、云同步、支付、社区
- 总分、健康度、人格类型、依恋类型或匹配百分比
- 完整的生产级鉴权、远程数据库、队列、速率限制与审计日志

## Phase 3 最自然的下一步

在不改变 Planner → 程序决策边界的前提下，为固定题库无法覆盖的高价值 ProbeIntent 增加受控 Question Generator：定义更严格的生成题 Schema、变量单改校验、语义重复与极端度审查、失败回退到固定题库，并建立 OpenAI-compatible / DeepSeek provider conformance tests。生成问题仍需经过 Zod 和纯程序审核后才能加入 Session，AI 不能直接写状态。
