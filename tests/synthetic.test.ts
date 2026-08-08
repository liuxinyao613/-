import assert from "node:assert/strict";
import test from "node:test";
import {
  abPersonaIds,
  smokePersonaIds,
  syntheticPersonaById,
  syntheticPersonas,
} from "@/data/synthetic-personas";
import { MockProvider } from "@/lib/ai/providers/mock-provider";
import { runSyntheticSession } from "@/lib/synthetic/runner";
import {
  buildSimulatorPersonaView,
  type SyntheticUserSimulator,
} from "@/lib/synthetic/simulator";
import type { SimulatorAnswer } from "@/lib/synthetic/schemas";

const requiredPhrases = [
  "可以，但是会很难受",
  "救急不救穷",
  "工作需要的话可以",
  "可以，但是时间久了我应该会慢慢放手",
  "我不希望她这么做，但她做了我也不会怪她",
  "密码可以给，但是不能偷偷翻",
  "过去的已经过去了",
  "偶尔一次还好，老这样肯定不行",
  "有点膈应但也不是不行",
  "真发生了以后我可能才知道",
];

test("persona bank covers all required archetypes and Chinese edge phrases", () => {
  assert.ok(syntheticPersonas.length >= 20);
  assert.equal(new Set(syntheticPersonas.map((item) => item.personaId)).size, syntheticPersonas.length);
  const archetypes = new Set(syntheticPersonas.flatMap((item) => item.archetypes));
  for (const required of [
    "CLEAR_RULES",
    "CONDITIONAL",
    "HIDDEN_COST",
    "HIGH_UNKNOWN",
    "SURFACE_CONSISTENT",
    "TRUE_CONTRADICTION",
    "MINIMALIST",
    "COLLOQUIAL_ZH",
  ]) {
    assert.ok(archetypes.has(required as never), `missing archetype ${required}`);
  }
  const phrases = syntheticPersonas.flatMap((item) => item.signaturePhrases);
  requiredPhrases.forEach((phrase) => assert.ok(phrases.includes(phrase), `missing phrase ${phrase}`));
});

test("smoke and A/B cohorts are fixed, representative, and valid", () => {
  assert.equal(smokePersonaIds.length, 3);
  assert.equal(abPersonaIds.length, 5);
  for (const id of [...smokePersonaIds, ...abPersonaIds]) {
    assert.ok(syntheticPersonaById.has(id), `unknown cohort persona ${id}`);
  }
  const abArchetypes = new Set(
    abPersonaIds.flatMap((id) => syntheticPersonaById.get(id)!.archetypes),
  );
  for (const required of [
    "CONDITIONAL",
    "HIDDEN_COST",
    "HIGH_UNKNOWN",
    "COLLOQUIAL_ZH",
    "SURFACE_CONSISTENT",
  ]) {
    assert.ok(abArchetypes.has(required as never), `A/B missing ${required}`);
  }
});

test("simulator view excludes product ground-truth labels and evaluator fields", () => {
  const view = buildSimulatorPersonaView(syntheticPersonaById.get("conditional-context")!);
  const serialized = JSON.stringify(view);
  for (const forbidden of [
    "personaId",
    "archetypes",
    "dimension",
    "expectedChoice",
    "keywords",
    "expectedFlips",
    "hiddenCostPatterns",
    "trueContradictionDimensions",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `simulator leaked ${forbidden}`);
  }
});

const deterministicSimulator: SyntheticUserSimulator = {
  config: {
    baseUrl: "https://invalid.test/v1",
    apiKey: "unit-test-only",
    model: "deterministic-user",
    reasoningEffort: null,
    thinking: null,
    structuredOutputMode: "json_schema",
    providerName: "deterministic-simulator",
    timeoutMs: 1,
  },
  async answer({ persona, question, history }) {
    const matching =
      persona.boundaryRules.find(
        (item) =>
          item.dimension === question.dimension &&
          item.keywords.some((keyword) => question.text.includes(keyword)),
      ) ?? persona.boundaryRules.find((item) => item.dimension === question.dimension);
    const choice: SimulatorAnswer["choice"] = matching?.expectedChoice ??
      (persona.archetypes.includes("CONDITIONAL") ? "DEPENDS" : "ACCEPT");
    const note = history.length % 5 === 0 ? persona.signaturePhrases[0] ?? null : null;
    return {
      answer: { choice, note },
      telemetry: {
        id: `test-simulator-${crypto.randomUUID()}`,
        role: "USER_SIMULATOR" as const,
        provider: "deterministic-simulator",
        requestedModel: "deterministic-user",
        returnedModel: "deterministic-user",
        reasoningEffort: null,
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 4,
        reasoningTokens: 0,
        totalTokens: 14,
        latencyMs: 0,
        success: true,
        errorType: null,
        timestamp: new Date().toISOString(),
      },
    };
  },
};

test("runner completes a full Core + Adaptive session without external AI", async () => {
  const result = await runSyntheticSession({
    runId: "unit-test-run",
    persona: syntheticPersonaById.get("conditional-context")!,
    productTarget: "sol",
    simulator: deterministicSimulator,
    productOverride: {
      provider: new MockProvider(),
      providerName: "mock-product",
      model: "mock",
    },
  });
  assert.equal(result.metrics.coreQuestions, 24);
  assert.ok(result.metrics.adaptiveQuestions >= 8);
  assert.ok(result.metrics.totalQuestions <= 50);
  assert.equal(result.metrics.testCompleted, true);
  assert.equal(result.session.structuredReport?.reportVersion, 2);
  assert.equal(
    result.trace.filter((item) => item.kind === "ANSWER").length,
    result.metrics.totalQuestions,
  );
  const latestRaw = result.session.rawResponses.at(-1);
  const latestTrace = [...result.trace].reverse().find((item) => item.kind === "ANSWER");
  assert.equal(latestRaw?.note, latestTrace?.simulatorAnswer.note ?? "");
});

test("a report call that crosses the hard token budget cannot be marked completed", async () => {
  const base = new MockProvider();
  const budgetCrossingProvider = {
    interpretAnswer: base.interpretAnswer.bind(base),
    planProbe: base.planProbe.bind(base),
    generateQuestion: base.generateQuestion.bind(base),
    async writeReport(input: Parameters<MockProvider["writeReport"]>[0]) {
      const result = await base.writeReport(input);
      return {
        ...result,
        telemetry: {
          ...result.telemetry,
          inputTokens: 149_000,
          outputTokens: 5_000,
          totalTokens: 154_000,
        },
      };
    },
  };
  const result = await runSyntheticSession({
    runId: "unit-test-token-budget",
    persona: syntheticPersonaById.get("clear-autonomy")!,
    productTarget: "deepseek",
    simulator: deterministicSimulator,
    productOverride: {
      provider: budgetCrossingProvider,
      providerName: "budget-crossing-mock",
      model: "mock",
    },
  });
  assert.equal(result.metrics.stopReason, "TOKEN_BUDGET_EXCEEDED");
  assert.equal(result.metrics.testCompleted, false);
  assert.ok(result.metrics.totalTokens >= 150_000);
});
