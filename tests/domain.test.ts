import assert from "node:assert/strict";
import test from "node:test";
import { adaptiveQuestionBank } from "../data/adaptive-question-bank";
import { coreQuestions } from "../data/core-24";
import { allQuestions } from "../data/questions";
import {
  AnswerInterpretationPayloadSchema,
  InterpretAnswerOutputSchema,
} from "../lib/ai/contracts";
import {
  acceptanceForChoice,
  normalizeInterpretation,
  shouldInterpretResponse,
} from "../lib/ai/interpretation-policy";
import { normalizeResponseContent, normalizeUsage } from "../lib/ai/normalization";
import { DimensionAnalysisCoordinator } from "../lib/ai/dimension-analysis-coordinator";
import { getServerAIRoleOptions } from "../lib/ai/server";
import { MockProvider } from "../lib/ai/providers/mock-provider";
import {
  selectAdaptiveQuestions,
  shouldStopAdaptive,
} from "../lib/adaptive/flow";
import {
  AcceptanceSemantic,
  AITelemetryRole,
  AnswerChoice,
  BoundaryDimension,
  BoundaryPosition,
  DiscomfortLevel,
  ExitSignal,
  ProbeType,
  RelationshipStateChange,
  SessionSchema,
  SustainabilityLevel,
  type ProbeIntent,
  type Question,
  type Session,
} from "../lib/domain/schemas";
import { buildReportFacts, buildStructuredReport } from "../lib/report/build-report";
import { sessionReducer } from "../lib/session/reducer";
import {
  createSession,
  makeDirectEvidence,
  makeRawResponse,
} from "../lib/session/session";

function recordAnswer(
  session: Session,
  question: Question,
  answer: AnswerChoice,
  note = "",
): Session {
  const minute = (session.rawResponses.length + 1) % 60;
  const hour = Math.floor((session.rawResponses.length + 1) / 60);
  const response = makeRawResponse(
    session,
    question,
    answer,
    note,
    new Date(`2026-01-01T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`),
  );
  return sessionReducer(session, {
    type: "RECORD_RESPONSE",
    response,
    evidence: makeDirectEvidence(response),
    nextIndex: session.currentIndex + 1,
  });
}

function makeIntent(
  dimension: BoundaryDimension,
  suffix: string,
  overrides: Partial<ProbeIntent> = {},
): ProbeIntent {
  return {
    id: `intent-${suffix}`,
    dimension,
    probeType: ProbeType.SINGLE_VARIABLE,
    targetVariable: "relationship_context",
    informationGoal: "验证一个变量变化后边界是否稳定。",
    fixedVariables: [],
    desiredChange: "只改变关系情境。",
    preferredTags: [],
    desiredExtremity: 2,
    priority: 0.8,
    ...overrides,
  };
}

test("Phase 2 keeps 11 dimensions, Core-24, and a metadata-complete fixed bank", () => {
  assert.equal(Object.values(BoundaryDimension).length, 11);
  assert.equal(coreQuestions.length, 24);
  assert.equal(adaptiveQuestionBank.length, 44);
  assert.equal(allQuestions.length, 68);
  assert.ok(adaptiveQuestionBank.every((question) => question.source === "QUESTION_BANK"));
  assert.ok(adaptiveQuestionBank.every((question) => question.core === false));
  assert.ok(adaptiveQuestionBank.every((question) => question.scenarioTags.length > 0));
  assert.ok(adaptiveQuestionBank.every((question) => question.variables.length > 0));
});

test("dimension analysis is serial within a dimension and parallel across dimensions", async () => {
  const coordinator = new DimensionAnalysisCoordinator(2);
  const events: string[] = [];
  let active = 0;
  let maxActive = 0;
  let releaseAutonomy!: () => void;
  let releasePrivacy!: () => void;
  const autonomyGate = new Promise<void>((resolve) => {
    releaseAutonomy = resolve;
  });
  const privacyGate = new Promise<void>((resolve) => {
    releasePrivacy = resolve;
  });
  const task = (name: string, gate?: Promise<void>) => async () => {
    events.push(`${name}:start`);
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      await gate;
    } finally {
      active -= 1;
      events.push(`${name}:end`);
    }
  };

  void coordinator.enqueue(
    BoundaryDimension.AUTONOMY_CONTROL,
    task("autonomy-1", autonomyGate),
  );
  void coordinator.enqueue(
    BoundaryDimension.AUTONOMY_CONTROL,
    task("autonomy-2"),
  );
  void coordinator.enqueue(
    BoundaryDimension.PRIVACY_PERSONAL_SPACE,
    task("privacy-1", privacyGate),
  );
  void coordinator.enqueue(
    BoundaryDimension.HONESTY_AUTHENTICITY,
    task("honesty-1"),
  );

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2);
  assert.equal(maxActive, 2);
  assert.ok(!events.includes("autonomy-2:start"));
  assert.ok(!events.includes("honesty-1:start"));

  releasePrivacy();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(events.includes("honesty-1:start"));
  assert.ok(!events.includes("autonomy-2:start"));

  releaseAutonomy();
  await coordinator.drain();
  assert.ok(events.indexOf("autonomy-1:end") < events.indexOf("autonomy-2:start"));
  assert.equal(coordinator.pending, 0);
});

test("interactive AI uses a lighter interpreter and stronger aggregate roles", () => {
  const options = getServerAIRoleOptions({});
  assert.equal(
    options[AITelemetryRole.ANSWER_INTERPRETER]?.reasoningEffort,
    "medium",
  );
  assert.equal(options[AITelemetryRole.PROBE_PLANNER]?.reasoningEffort, "xhigh");
  assert.equal(options[AITelemetryRole.REPORT_WRITER]?.reasoningEffort, "xhigh");
  assert.equal(options[AITelemetryRole.ANSWER_INTERPRETER]?.timeoutMs, 45_000);
});

test("RawResponse history stays append-only when an answer is revised", () => {
  let session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  const question = allQuestions[0];
  session = recordAnswer(session, question, AnswerChoice.CAN_ACCEPT, "第一次的原文");
  session = recordAnswer(session, question, AnswerChoice.CANNOT_ACCEPT, "第二次的原文");

  assert.equal(session.rawResponses.length, 2);
  assert.equal(session.rawResponses[0].note, "第一次的原文");
  assert.equal(session.rawResponses[1].note, "第二次的原文");
  assert.equal(session.rawResponses[1].supersedesResponseId, session.rawResponses[0].id);
});

test("interpreter policy skips plain binary answers and preserves every button semantic", () => {
  const session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  for (const choice of Object.values(AnswerChoice)) {
    const response = makeRawResponse(session, allQuestions[0], choice, "");
    const expected = [AnswerChoice.DEPENDS, AnswerChoice.UNSURE].includes(choice);
    assert.equal(shouldInterpretResponse(response), expected);
    assert.equal(acceptanceForChoice[choice], {
      [AnswerChoice.CAN_ACCEPT]: AcceptanceSemantic.ACCEPT,
      [AnswerChoice.CANNOT_ACCEPT]: AcceptanceSemantic.REJECT,
      [AnswerChoice.DEPENDS]: AcceptanceSemantic.DEPENDS,
      [AnswerChoice.UNSURE]: AcceptanceSemantic.UNKNOWN,
      [AnswerChoice.SKIPPED]: AcceptanceSemantic.SKIPPED,
    }[choice]);
  }

  const noted = makeRawResponse(
    session,
    allQuestions[0],
    AnswerChoice.CAN_ACCEPT,
    "可以，但时间久了我会慢慢放手",
  );
  assert.equal(shouldInterpretResponse(noted), true);
});

test("normalization cannot let AI rewrite the raw choice and only cites verbatim text", () => {
  const session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  const question = allQuestions[0];
  const response = makeRawResponse(
    session,
    question,
    AnswerChoice.CAN_ACCEPT,
    "可以，但时间久了我会慢慢放手",
  );
  const output = normalizeInterpretation(
    {
      acceptance: AcceptanceSemantic.REJECT,
      discomfort: DiscomfortLevel.HIGH,
      sustainability: SustainabilityLevel.LOW,
      conditional: true,
      conditions: [],
      relationshipStateChange: RelationshipStateChange.DISTANCING,
      exitSignal: ExitSignal.DELAYED_EXIT,
      principleHints: ["长期消耗会改变关系状态"],
      semanticConflict: { present: true, description: "当前接受但长期不可持续" },
      requiresFollowup: true,
      followupReason: "需要确认可承受期限。",
      summary: "当下可以承受，但长期会逐渐退出。",
      sourceQuote: "时间久了我会慢慢放手",
      confidence: 0.88,
    },
    { question, response, relatedEvidence: [], knownRules: [] },
    "interpretation-fixed",
  );

  assert.equal(output.acceptance, AcceptanceSemantic.ACCEPT);
  assert.equal(output.discomfort, DiscomfortLevel.HIGH);
  assert.equal(output.sustainability, SustainabilityLevel.LOW);
  assert.equal(output.exitSignal, ExitSignal.DELAYED_EXIT);
  assert.equal(output.sourceQuote, "时间久了我会慢慢放手");

  const noFabricatedQuote = normalizeInterpretation(
    { ...output, sourceQuote: "用户没有说过的话" },
    { question, response, relatedEvidence: [], knownRules: [] },
  );
  assert.equal(noFabricatedQuote.sourceQuote, "");
});

test("MockProvider regression examples preserve acceptance while extracting second-layer meaning", async () => {
  const provider = new MockProvider();
  const session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  const question = allQuestions[0];
  const interpret = async (note: string) => {
    const response = makeRawResponse(
      session,
      question,
      AnswerChoice.CAN_ACCEPT,
      note,
    );
    return (
      await provider.interpretAnswer({
        question,
        response,
        relatedEvidence: [],
        knownRules: [],
      })
    ).data;
  };

  const discomfort = await interpret("可以，但是会很难受");
  assert.equal(discomfort.acceptance, AcceptanceSemantic.ACCEPT);
  assert.equal(discomfort.discomfort, DiscomfortLevel.HIGH);

  const emergency = await interpret("救急不救穷");
  assert.equal(emergency.conditional, true);
  assert.equal(emergency.conditions[0]?.variable, "emergency_vs_pattern");

  const work = await interpret("工作需要的话可以");
  assert.equal(work.conditional, true);
  assert.equal(work.conditions[0]?.variable, "work_necessity");

  const delayedExit = await interpret("可以，但是时间久了我会慢慢放手");
  assert.equal(delayedExit.acceptance, AcceptanceSemantic.ACCEPT);
  assert.equal(delayedExit.discomfort, DiscomfortLevel.HIGH);
  assert.equal(delayedExit.sustainability, SustainabilityLevel.LOW);
  assert.equal(delayedExit.exitSignal, ExitSignal.DELAYED_EXIT);
});

test("validated interpretations merge through the pure reducer", () => {
  let session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  const question = allQuestions[0];
  session = recordAnswer(
    session,
    question,
    AnswerChoice.CAN_ACCEPT,
    "只在提前说清时可以，但长期我会离开",
  );
  const response = session.rawResponses[0];
  const output = normalizeInterpretation(
    {
      acceptance: AcceptanceSemantic.ACCEPT,
      discomfort: DiscomfortLevel.HIGH,
      sustainability: SustainabilityLevel.LOW,
      conditional: true,
      conditions: [
        {
          variable: "advance_notice",
          statement: "需要提前说清",
          consequence: "未提前沟通时不可接受",
          confidence: 0.9,
        },
      ],
      relationshipStateChange: RelationshipStateChange.END_RELATIONSHIP,
      exitSignal: ExitSignal.DELAYED_EXIT,
      principleHints: ["提前沟通"],
      semanticConflict: { present: true, description: "当下接受但不可长期持续" },
      requiresFollowup: true,
      followupReason: "确认长期期限",
      summary: "当下可承受，长期会退出。",
      sourceQuote: "长期我会离开",
      confidence: 0.9,
    },
    { question, response, relatedEvidence: [], knownRules: [] },
    "interpretation-reducer",
  );
  session = sessionReducer(session, {
    type: "ACCEPT_VALIDATED_INTERPRETATION",
    output,
    at: "2026-01-01T00:02:00.000Z",
  });

  assert.equal(session.rawResponses.length, 1);
  assert.equal(session.evidence.length, 2);
  assert.equal(session.conditions[0]?.variable, "advance_notice");
  assert.equal(session.hiddenCosts.length, 1);
  assert.equal(session.boundaryFlips.length, 1);
  assert.deepEqual(session.acceptedInterpretations, ["interpretation-reducer"]);
  assert.doesNotThrow(() => SessionSchema.parse(session));
});

test("adaptive selector honors intent dimensions, cooldown, and normal extremity limits", () => {
  const base = createSession(new Date("2026-01-01T00:00:00.000Z"));
  const selected = selectAdaptiveQuestions(base, [
    makeIntent(BoundaryDimension.AUTONOMY_CONTROL, "autonomy"),
    makeIntent(BoundaryDimension.PRIVACY_PERSONAL_SPACE, "privacy"),
  ]);
  assert.equal(selected.length, 2);
  assert.deepEqual(
    new Set(selected.map((question) => question.primaryDimension)),
    new Set([
      BoundaryDimension.AUTONOMY_CONTROL,
      BoundaryDimension.PRIVACY_PERSONAL_SPACE,
    ]),
  );
  assert.ok(selected.every((question) => question.extremity <= 3));
  assert.ok(selected.every((question) => !base.questionOrder.includes(question.id)));

  const autonomyQuestions = coreQuestions.filter(
    (question) => question.dimension === BoundaryDimension.AUTONOMY_CONTROL,
  );
  let cooled = recordAnswer(base, autonomyQuestions[0], AnswerChoice.CAN_ACCEPT);
  cooled = recordAnswer(cooled, autonomyQuestions[1], AnswerChoice.CAN_ACCEPT);
  const afterCooldown = selectAdaptiveQuestions(cooled, [
    makeIntent(BoundaryDimension.AUTONOMY_CONTROL, "cooldown"),
  ]);
  assert.ok(
    afterCooldown.every(
      (question) => question.primaryDimension !== BoundaryDimension.AUTONOMY_CONTROL,
    ),
  );

  const repeatedIntentSelection = selectAdaptiveQuestions(base, [
    makeIntent(BoundaryDimension.AUTONOMY_CONTROL, "repeat-1", { priority: 0.9 }),
    makeIntent(BoundaryDimension.AUTONOMY_CONTROL, "repeat-2", { priority: 0.8 }),
    makeIntent(BoundaryDimension.AUTONOMY_CONTROL, "repeat-3", { priority: 0.7 }),
  ]);
  assert.ok(
    !repeatedIntentSelection
      .map((question) => question.primaryDimension)
      .some(
        (dimension, index, dimensions) =>
          index >= 2 && dimension === dimensions[index - 1] && dimension === dimensions[index - 2],
      ),
  );
});

test("adaptive stopping requires enough probes unless target or hard limit is reached", () => {
  let session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  for (const question of coreQuestions) {
    session = recordAnswer(session, question, AnswerChoice.CAN_ACCEPT);
  }
  assert.equal(shouldStopAdaptive(session, true, 0), false);

  const firstEight = adaptiveQuestionBank.slice(0, 8);
  session = sessionReducer(session, {
    type: "APPEND_PROBES",
    intents: [],
    questionIds: firstEight.map((question) => question.id),
    at: "2026-01-01T01:00:00.000Z",
  });
  for (const question of firstEight) {
    session = recordAnswer(session, question, AnswerChoice.CAN_ACCEPT);
  }
  assert.equal(shouldStopAdaptive(session, true, 0), true);

  const throughTarget = adaptiveQuestionBank.slice(8, 14);
  session = sessionReducer(session, {
    type: "APPEND_PROBES",
    intents: [],
    questionIds: throughTarget.map((question) => question.id),
    at: "2026-01-01T02:00:00.000Z",
  });
  for (const question of throughTarget) {
    session = recordAnswer(session, question, AnswerChoice.CAN_ACCEPT);
  }
  assert.equal(session.rawResponses.length, 38);
  assert.equal(shouldStopAdaptive(session, false, 2), true);
});

test("provider response normalization covers OpenAI-compatible token variants", () => {
  assert.deepEqual(
    normalizeUsage({
      usage: {
        prompt_tokens: 120,
        completion_tokens: 30,
        total_tokens: 150,
        prompt_tokens_details: { cached_tokens: 80 },
        completion_tokens_details: { reasoning_tokens: 12 },
      },
    }),
    {
      inputTokens: 120,
      cachedInputTokens: 80,
      outputTokens: 30,
      reasoningTokens: 12,
      totalTokens: 150,
    },
  );
  assert.deepEqual(
    normalizeResponseContent({
      output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
    }),
    { ok: true },
  );
});

test("a complete Core-24 plus adaptive run produces a validated fallback report", () => {
  let session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  const adaptive = adaptiveQuestionBank.slice(0, 8);
  session = sessionReducer(session, {
    type: "APPEND_PROBES",
    intents: [],
    questionIds: adaptive.map((question) => question.id),
    at: "2026-01-01T00:00:01.000Z",
  });
  const questions = [...coreQuestions, ...adaptive];
  questions.forEach((question, index) => {
    session = recordAnswer(
      session,
      question,
      index % 5 === 0 ? AnswerChoice.DEPENDS : AnswerChoice.CAN_ACCEPT,
      index % 5 === 0 ? "需要事先说清，并且不能变成长期模式" : "",
    );
  });
  session = sessionReducer(session, {
    type: "COMPLETE_SESSION",
    at: "2026-01-01T02:00:00.000Z",
  });

  assert.equal(session.status, "COMPLETED");
  assert.equal(session.phase, "REPORT");
  assert.equal(session.rawResponses.length, 32);
  assert.doesNotThrow(() => SessionSchema.parse(session));

  const facts = buildReportFacts(session, new Date("2026-01-01T03:00:00.000Z"));
  const report = buildStructuredReport(session, facts);
  assert.equal(report.reportVersion, 2);
  assert.equal(report.generatedBy, "FALLBACK");
  assert.equal(report.dimensionMap.length, 11);
  assert.equal(report.evidencePanels.length, 11);
  assert.ok(report.corePrinciples.length > 0);
});

test("unsure remains unresolved instead of becoming a midpoint", () => {
  let session = createSession(new Date("2026-01-01T00:00:00.000Z"));
  session = recordAnswer(
    session,
    allQuestions[0],
    AnswerChoice.UNSURE,
    "我没有经历过",
  );
  const state = buildReportFacts(session).boundaryStates.find(
    (item) => item.dimension === BoundaryDimension.AUTONOMY_CONTROL,
  );
  assert.equal(state?.position, BoundaryPosition.UNRESOLVED);
});

test("invalid provider output cannot cross the validation boundary", () => {
  assert.throws(() =>
    InterpretAnswerOutputSchema.parse({
      interpretationId: "bad-output",
      summary: "missing required evidence arrays",
    }),
  );
  assert.throws(() =>
    AnswerInterpretationPayloadSchema.parse({
      acceptance: "MIDDLE",
      conditions: [],
    }),
  );
});
