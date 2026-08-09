import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { allKnownQuestions } from "@/data/questions";
import { DimensionAnalysisCoordinator } from "@/lib/ai/dimension-analysis-coordinator";
import { shouldInterpretResponse } from "@/lib/ai/interpretation-policy";
import { ProviderCallError } from "@/lib/ai/provider";
import { getServerAIProvider } from "@/lib/ai/server";
import {
  AITelemetryRole,
  AnswerChoice,
  SessionSchema,
  type Session,
} from "@/lib/domain/schemas";
import { buildReportFacts, buildStructuredReport } from "@/lib/report/build-report";
import { sessionReducer } from "@/lib/session/reducer";
import {
  createSession,
  latestResponses,
  makeDirectEvidence,
  makeRawResponse,
} from "@/lib/session/session";

const captureSchema = z.object({
  capturedAt: z.string().datetime(),
  source: z.string(),
  answerCount: z.number().int().positive(),
  answers: z.array(
    z.object({
      question: z.string().min(1),
      dimension: z.string().min(1),
      answer: z.enum(["可以", "不可以", "看情况", "我不知道", "跳过"]),
      note: z.string().max(280),
    }),
  ),
});

const answerChoice = {
  可以: AnswerChoice.CAN_ACCEPT,
  不可以: AnswerChoice.CANNOT_ACCEPT,
  看情况: AnswerChoice.DEPENDS,
  我不知道: AnswerChoice.UNSURE,
  跳过: AnswerChoice.SKIPPED,
} as const;

function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const inputPath = path.resolve(
    process.cwd(),
    process.argv[2] ?? "test-results/manual/current-answer-replay.json",
  );
  const outputDirectory = path.dirname(inputPath);
  const capture = captureSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
  if (capture.answerCount !== capture.answers.length) {
    throw new Error("Captured answerCount does not match the answer list.");
  }

  const questionByText = new Map(allKnownQuestions.map((question) => [question.text, question]));
  const questions = capture.answers.map((answer) => {
    const question = questionByText.get(answer.question);
    if (!question) throw new Error(`Captured question is not in the fixed bank: ${answer.question}`);
    return question;
  });
  if (new Set(questions.map((question) => question.id)).size !== questions.length) {
    throw new Error("Manual replay contains duplicate questions.");
  }

  const provider = getServerAIProvider();
  const coordinator = new DimensionAnalysisCoordinator(4);
  const errors: Array<{ role: string; errorType: string; message: string }> = [];
  const capturedAt = new Date(capture.capturedAt);
  let session: Session = {
    ...createSession(capturedAt),
    questionOrder: questions.map((question) => question.id),
    adaptiveConfig: {
      minAdaptive: 8,
      targetTotal: questions.length,
      softLimit: Math.max(questions.length, 45),
      hardLimit: 50,
    },
  };

  const acceptFailure = (role: AITelemetryRole, error: unknown) => {
    const providerError = error instanceof ProviderCallError ? error : undefined;
    if (providerError?.telemetry) {
      session = sessionReducer(session, {
        type: "ADD_TELEMETRY",
        telemetry: providerError.telemetry,
      });
    }
    errors.push({
      role,
      errorType: providerError?.errorType ?? "UNKNOWN",
      message: error instanceof Error ? error.message : "Unknown provider error.",
    });
  };

  capture.answers.forEach((captured, index) => {
    const question = questions[index];
    const response = makeRawResponse(
      session,
      question,
      answerChoice[captured.answer],
      captured.note,
      new Date(capturedAt.getTime() + (index + 1) * 1_000),
    );
    session = sessionReducer(session, {
      type: "RECORD_RESPONSE",
      response,
      evidence: makeDirectEvidence(response),
      nextIndex: session.currentIndex + 1,
    });
    if (!shouldInterpretResponse(response)) return;

    void coordinator.enqueue(question.dimension, async () => {
      const current = session;
      const relatedEvidence = current.evidence
        .filter(
          (item) =>
            item.dimension === question.dimension && item.rawResponseId !== response.id,
        )
        .slice(-8);
      const knownRules = buildReportFacts(current).knownRules
        .filter((item) => item.dimension === question.dimension)
        .slice(0, 6);
      try {
        const result = await provider.interpretAnswer({
          question,
          response,
          relatedEvidence,
          knownRules,
        });
        session = sessionReducer(session, {
          type: "ADD_TELEMETRY",
          telemetry: result.telemetry,
        });
        if (latestResponses(session.rawResponses).get(question.id)?.id === response.id) {
          session = sessionReducer(session, {
            type: "ACCEPT_VALIDATED_INTERPRETATION",
            output: result.data,
            at: new Date().toISOString(),
          });
        }
      } catch (error) {
        acceptFailure(AITelemetryRole.ANSWER_INTERPRETER, error);
      }
    });
  });

  await coordinator.drain();
  let facts = buildReportFacts(session);
  let plannerOutput: unknown = null;
  try {
    const result = await provider.planProbe({ session, facts });
    plannerOutput = result.data;
    session = sessionReducer(session, {
      type: "ADD_TELEMETRY",
      telemetry: result.telemetry,
    });
  } catch (error) {
    acceptFailure(AITelemetryRole.PROBE_PLANNER, error);
  }

  session = sessionReducer(session, {
    type: "COMPLETE_SESSION",
    at: new Date().toISOString(),
  });
  facts = buildReportFacts(session);
  try {
    const result = await provider.writeReport({ session, facts });
    session = sessionReducer(session, {
      type: "ADD_TELEMETRY",
      telemetry: result.telemetry,
    });
    session = sessionReducer(session, {
      type: "SET_REPORT",
      report: result.data.report,
      status: "READY",
      at: new Date().toISOString(),
    });
  } catch (error) {
    acceptFailure(AITelemetryRole.REPORT_WRITER, error);
    session = sessionReducer(session, {
      type: "SET_REPORT",
      report: buildStructuredReport(session, facts),
      status: "FALLBACK",
      error: errors.at(-1)?.errorType,
      at: new Date().toISOString(),
    });
  }

  const validated = SessionSchema.parse(session);
  const telemetryByRole = Object.values(AITelemetryRole).map((role) => {
    const events = validated.telemetry.filter((item) => item.role === role);
    return {
      role,
      calls: events.length,
      successfulCalls: events.filter((item) => item.success).length,
      totalLatencyMs: events.reduce((sum, item) => sum + item.latencyMs, 0),
      totalTokens: events.reduce((sum, item) => sum + item.totalTokens, 0),
      reasoningEfforts: [...new Set(events.map((item) => item.reasoningEffort))],
    };
  });
  const result = {
    replayedAt: new Date().toISOString(),
    sourceCapture: path.basename(inputPath),
    answerCount: capture.answers.length,
    interpretedAnswerCount: validated.acceptedInterpretations.length,
    boundaryLabel: validated.structuredReport?.boundaryLabel,
    reportStatus: validated.reportStatus,
    telemetryByRole,
    errors,
    plannerOutput,
    session: validated,
  };

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "current-answer-replay-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputDirectory, "CURRENT_ANSWER_REPLAY_SUMMARY.md"),
    [
      "# Current Answer Replay Summary",
      "",
      `- Answers replayed: ${result.answerCount}`,
      `- AI interpretations accepted: ${result.interpretedAnswerCount}`,
      `- Report status: ${result.reportStatus}`,
      `- Boundary label: ${result.boundaryLabel ?? "未生成"}`,
      `- Provider errors: ${result.errors.length}`,
      "",
      "## Telemetry",
      "",
      ...telemetryByRole.map(
        (item) =>
          `- ${item.role}: ${item.calls} calls, ${item.totalTokens} tokens, ${item.totalLatencyMs} ms`,
      ),
      "",
      "The full replay result remains local under test-results/manual and is ignored by Git.",
      "",
    ].join("\n"),
    "utf8",
  );

  console.log(
    JSON.stringify({
      answerCount: result.answerCount,
      interpretedAnswerCount: result.interpretedAnswerCount,
      reportStatus: result.reportStatus,
      boundaryLabel: result.boundaryLabel,
      providerErrors: result.errors.length,
      telemetryByRole,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
