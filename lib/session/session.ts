import { coreQuestions } from "@/data/core-24";
import {
  AnswerChoice,
  type AnswerEvidence,
  type Question,
  type RawResponse,
  type Session,
} from "@/lib/domain/schemas";

export function createId(prefix: string): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

export function createSession(now = new Date()): Session {
  const timestamp = now.toISOString();
  return {
    id: createId("session"),
    schemaVersion: 2,
    status: "IN_PROGRESS",
    phase: "CORE",
    currentIndex: 0,
    questionOrder: coreQuestions.map((question) => question.id),
    rawResponses: [],
    evidence: [],
    conditions: [],
    boundaryFlips: [],
    hiddenCosts: [],
    boundaryStates: [],
    probeIntents: [],
    acceptedInterpretations: [],
    telemetry: [],
    adaptiveConfig: {
      minAdaptive: 8,
      targetTotal: 38,
      softLimit: 45,
      hardLimit: 50,
    },
    reportStatus: "IDLE",
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function latestResponses(responses: RawResponse[]): Map<string, RawResponse> {
  const latest = new Map<string, RawResponse>();
  for (const response of responses) {
    const current = latest.get(response.questionId);
    if (!current || response.sequence > current.sequence) latest.set(response.questionId, response);
  }
  return latest;
}

export function makeRawResponse(
  session: Session,
  question: Question,
  answer: AnswerChoice,
  note: string,
  now = new Date(),
): RawResponse {
  const previous = latestResponses(session.rawResponses).get(question.id);
  return {
    id: createId("response"),
    sessionId: session.id,
    questionId: question.id,
    questionVersion: question.version,
    questionTextSnapshot: question.text,
    dimensionSnapshot: question.dimension,
    stageSnapshot: question.stage,
    answer,
    note,
    submittedAt: now.toISOString(),
    sequence: session.rawResponses.length,
    supersedesResponseId: previous?.id,
  };
}

export function makeDirectEvidence(response: RawResponse): AnswerEvidence {
  return {
    id: createId("evidence"),
    rawResponseId: response.id,
    questionId: response.questionId,
    dimension: response.dimensionSnapshot,
    answer: response.answer,
    verbatimNote: response.note,
    kind: response.note ? "USER_TEXT" : "DIRECT_ANSWER",
    supports: "用户对该题情境的原始选择与补充短句。",
    createdAt: response.submittedAt,
  };
}
