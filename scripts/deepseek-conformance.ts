import path from "node:path";
import { coreQuestions } from "@/data/core-24";
import { getProductProvider } from "@/lib/synthetic/config";
import { buildReportFacts } from "@/lib/report/build-report";
import { sessionReducer } from "@/lib/session/reducer";
import {
  createSession,
  makeDirectEvidence,
  makeRawResponse,
} from "@/lib/session/session";
import { AnswerChoice } from "@/lib/domain/schemas";
import { ProviderCallError } from "@/lib/ai/provider";
import { writeSyntheticArtifact } from "@/lib/synthetic/persistence";

function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function telemetryView(value: {
  role: string;
  provider: string;
  requestedModel: string;
  returnedModel: string | null;
  reasoningEffort: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
}) {
  return {
    role: value.role,
    provider: value.provider,
    requestedModel: value.requestedModel,
    returnedModel: value.returnedModel,
    reasoningEffort: value.reasoningEffort,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
    reasoningTokens: value.reasoningTokens,
    totalTokens: value.totalTokens,
    latencyMs: value.latencyMs,
    success: value.success,
  };
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const product = getProductProvider("deepseek");
  let session = createSession();
  for (const [index, question] of coreQuestions.entries()) {
    const response = makeRawResponse(
      session,
      question,
      index % 4 === 0 ? AnswerChoice.DEPENDS : AnswerChoice.CAN_ACCEPT,
      index === 0 ? "可以，但要提前说一声" : "",
    );
    session = sessionReducer(session, {
      type: "RECORD_RESPONSE",
      response,
      evidence: makeDirectEvidence(response),
      nextIndex: index + 1,
    });
  }
  const facts = buildReportFacts(session);
  const firstResponse = session.rawResponses[0];
  const outcomes: Array<{
    role: string;
    validated: boolean;
    telemetry?: ReturnType<typeof telemetryView>;
    error?: string;
  }> = [];
  const attempt = async (
    role: string,
    call: () => Promise<{ telemetry: Parameters<typeof telemetryView>[0] }>,
  ) => {
    try {
      const result = await call();
      const telemetry = telemetryView(result.telemetry);
      outcomes.push({ role, validated: true, telemetry });
      console.log(JSON.stringify({ role, validated: true, telemetry }));
    } catch (error) {
      const telemetry =
        error instanceof ProviderCallError && error.telemetry
          ? telemetryView(error.telemetry)
          : undefined;
      const message =
        error instanceof Error
          ? error.message.replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
          : "Unknown error";
      outcomes.push({ role, validated: false, telemetry, error: message });
      console.log(
        JSON.stringify({ role, validated: false, telemetry, errorType: error instanceof ProviderCallError ? error.errorType : "UNKNOWN" }),
      );
    }
  };

  await attempt("ANSWER_INTERPRETER", () =>
    product.provider.interpretAnswer({
      question: coreQuestions[0],
      response: firstResponse,
      relatedEvidence: [],
      knownRules: [],
    }),
  );
  await attempt("PROBE_PLANNER", () => product.provider.planProbe({ session, facts }));
  await attempt("REPORT_WRITER", () => product.provider.writeReport({ session, facts }));

  const markdown = `# DeepSeek V4 Flash Max Conformance

- Product Provider：${product.providerName}
- Model：${product.model}
- Requested mode：thinking=enabled, reasoning_effort=max

| Role | Zod validated | Tokens | Latency | Telemetry effort | Error |
|---|---:|---:|---:|---|---|
${outcomes
  .map(
    (item) =>
      `| ${item.role} | ${item.validated ? "yes" : "no"} | ${item.telemetry?.totalTokens ?? "—"} | ${item.telemetry?.latencyMs ?? "—"} ms | ${item.telemetry?.reasoningEffort ?? "—"} | ${item.error ? item.error.replace(/\s+/g, " ").slice(0, 160) : "—"} |`,
  )
  .join("\n")}
`;
  const saved = await writeSyntheticArtifact("DEEPSEEK_MAX_CONFORMANCE.md", markdown);
  console.log(JSON.stringify({ saved, allValidated: outcomes.every((item) => item.validated) }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
