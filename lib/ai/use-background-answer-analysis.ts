"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { questionById } from "@/data/questions";
import { AIClientError, postAI } from "@/lib/ai/client";
import { InterpretAnswerOutputSchema, type InterpretAnswerOutput } from "@/lib/ai/contracts";
import { DimensionAnalysisCoordinator } from "@/lib/ai/dimension-analysis-coordinator";
import { shouldInterpretResponse } from "@/lib/ai/interpretation-policy";
import type { AITelemetry, Question, RawResponse, Session } from "@/lib/domain/schemas";
import { buildReportFacts } from "@/lib/report/build-report";
import { latestResponses } from "@/lib/session/session";

type BackgroundAnalysisInput = {
  session: Session | null;
  hydrated: boolean;
  getCurrent: () => Session | null;
  addTelemetry: (telemetry: AITelemetry) => Session;
  acceptInterpretation: (output: InterpretAnswerOutput) => Session;
};

function alreadyInterpreted(session: Session, responseId: string): boolean {
  return session.evidence.some(
    (item) => item.kind === "AI_INTERPRETATION" && item.rawResponseId === responseId,
  );
}

export function useBackgroundAnswerAnalysis(input: BackgroundAnalysisInput) {
  const {
    session,
    hydrated,
    getCurrent,
    addTelemetry,
    acceptInterpretation,
  } = input;
  const coordinatorRef = useRef<DimensionAnalysisCoordinator | null>(null);
  const scheduledResponseIds = useRef(new Set<string>());
  const activeSessionId = useRef<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  if (coordinatorRef.current == null) {
    coordinatorRef.current = new DimensionAnalysisCoordinator(4);
  }

  useEffect(
    () => coordinatorRef.current?.subscribe(setPendingCount),
    [],
  );

  const enqueue = useCallback(
    (question: Question, response: RawResponse) => {
      if (!shouldInterpretResponse(response)) return;
      if (scheduledResponseIds.current.has(response.id)) return;
      scheduledResponseIds.current.add(response.id);

      const job = coordinatorRef.current!.enqueue(question.dimension, async () => {
        let current = getCurrent();
        if (
          !current ||
          current.id !== response.sessionId ||
          alreadyInterpreted(current, response.id)
        ) return;
        if (latestResponses(current.rawResponses).get(question.id)?.id !== response.id) return;

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
          const result = await postAI(
            "/api/ai/interpret",
            { question, response, relatedEvidence, knownRules },
            InterpretAnswerOutputSchema,
          );
          current = getCurrent();
          if (!current || current.id !== response.sessionId) return;
          addTelemetry(result.telemetry);
          current = getCurrent();
          if (!current || alreadyInterpreted(current, response.id)) return;
          if (latestResponses(current.rawResponses).get(question.id)?.id !== response.id) return;
          acceptInterpretation(result.data);
        } catch (error) {
          current = getCurrent();
          if (
            current?.id === response.sessionId &&
            error instanceof AIClientError &&
            error.telemetry
          ) {
            addTelemetry(error.telemetry);
          }
        }
      });

      // Individual failures are recorded as telemetry and never interrupt answering.
      void job.catch(() => undefined);
    },
    [acceptInterpretation, addTelemetry, getCurrent],
  );

  useEffect(() => {
    if (!hydrated || !session) return;
    if (activeSessionId.current !== session.id) {
      activeSessionId.current = session.id;
      scheduledResponseIds.current.clear();
    }
    const interpreted = new Set(
      session.evidence
        .filter((item) => item.kind === "AI_INTERPRETATION")
        .map((item) => item.rawResponseId),
    );
    latestResponses(session.rawResponses).forEach((response, questionId) => {
      if (interpreted.has(response.id) || !shouldInterpretResponse(response)) return;
      const question = questionById.get(questionId);
      if (question) enqueue(question, response);
    });
  }, [enqueue, hydrated, session]);

  const drain = useCallback(
    () => coordinatorRef.current!.drain(),
    [],
  );

  return { enqueue, drain, pendingCount };
}
