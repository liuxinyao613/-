import {
  AcceptanceSemantic,
  AnswerChoice,
  DiscomfortLevel,
  ExitSignal,
  RelationshipStateChange,
  SustainabilityLevel,
  type RawResponse,
} from "@/lib/domain/schemas";
import {
  AnswerInterpretationPayloadSchema,
  InterpretAnswerOutputSchema,
  type AnswerInterpretationPayload,
  type InterpretAnswerInput,
  type InterpretAnswerOutput,
} from "./contracts";

export const acceptanceForChoice: Record<AnswerChoice, AcceptanceSemantic> = {
  [AnswerChoice.CAN_ACCEPT]: AcceptanceSemantic.ACCEPT,
  [AnswerChoice.CANNOT_ACCEPT]: AcceptanceSemantic.REJECT,
  [AnswerChoice.DEPENDS]: AcceptanceSemantic.DEPENDS,
  [AnswerChoice.UNSURE]: AcceptanceSemantic.UNKNOWN,
  [AnswerChoice.SKIPPED]: AcceptanceSemantic.SKIPPED,
};

const hiddenCostPattern = /但是|但|不过|难受|累|消耗|委屈|勉强|长期|久了|慢慢|放手|离开|救急|救穷|工作需要/;

export function shouldInterpretResponse(response: RawResponse): boolean {
  if (response.note.length > 0) return true;
  if ([AnswerChoice.DEPENDS, AnswerChoice.UNSURE].includes(response.answer)) return true;
  return hiddenCostPattern.test(response.note);
}

export function basicInterpretationPayload(response: RawResponse): AnswerInterpretationPayload {
  return {
    acceptance: acceptanceForChoice[response.answer],
    discomfort: DiscomfortLevel.UNKNOWN,
    sustainability: SustainabilityLevel.UNKNOWN,
    conditional: response.answer === AnswerChoice.DEPENDS,
    conditions: [],
    relationshipStateChange: RelationshipStateChange.UNKNOWN,
    exitSignal: ExitSignal.UNKNOWN,
    principleHints: [],
    semanticConflict: { present: false, description: "" },
    requiresFollowup: [AnswerChoice.DEPENDS, AnswerChoice.UNSURE].includes(response.answer),
    followupReason:
      response.answer === AnswerChoice.DEPENDS
        ? "决定条件尚未解析。"
        : response.answer === AnswerChoice.UNSURE
          ? "需要在不过度追问的前提下澄清未知来源。"
          : "",
    summary: "仅保留原始按钮选择，未进行模型解释。",
    sourceQuote: "",
    confidence: 1,
  };
}

export function normalizeInterpretation(
  rawPayload: unknown,
  input: InterpretAnswerInput,
  interpretationId = `interpretation-${crypto.randomUUID()}`,
): InterpretAnswerOutput {
  const payload = AnswerInterpretationPayloadSchema.parse(rawPayload);
  const expectedAcceptance = acceptanceForChoice[input.response.answer];
  const note = input.response.note;
  const sourceQuote = note.includes(payload.sourceQuote) ? payload.sourceQuote : "";

  return InterpretAnswerOutputSchema.parse({
    ...payload,
    acceptance: expectedAcceptance,
    conditional:
      input.response.answer === AnswerChoice.DEPENDS ? true : payload.conditional,
    sourceQuote,
    interpretationId,
    rawResponseId: input.response.id,
    dimension: input.question.dimension,
  });
}
