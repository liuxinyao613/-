import { adaptiveQuestionBank } from "./adaptive-question-bank";
import { coreQuestions } from "./core-24";
import { mockProbeQuestions } from "./mock-probes";

export const allQuestions = [...coreQuestions, ...adaptiveQuestionBank];
export const allKnownQuestions = [
  ...coreQuestions,
  ...adaptiveQuestionBank,
  ...mockProbeQuestions,
];

export const questionById = new Map(
  allKnownQuestions.map((question) => [question.id, question]),
);

if (coreQuestions.length !== 24 || adaptiveQuestionBank.length < 40) {
  throw new Error("Phase 2 requires Core-24 plus at least 40 adaptive bank questions.");
}
