"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  AITelemetry,
  AnswerChoice,
  ProbeIntent,
  Question,
  Session,
  StructuredReport,
} from "@/lib/domain/schemas";
import type { InterpretAnswerOutput } from "@/lib/ai/contracts";
import { sessionReducer, type SessionEvent } from "./reducer";
import { createSession, makeDirectEvidence, makeRawResponse } from "./session";
import { loadSession, saveSession } from "./storage";

export function useBoundarySession() {
  const [session, dispatch] = useReducer(sessionReducer, null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const initial = loadSession() ?? createSession();
    sessionRef.current = initial;
    saveSession(initial);
    dispatch({ type: "HYDRATE", session: initial });
  }, []);

  const commit = useCallback((event: SessionEvent) => {
    const next = sessionReducer(sessionRef.current, event);
    sessionRef.current = next;
    saveSession(next);
    dispatch(event);
    return next;
  }, []);

  const record = useCallback(
    (question: Question, answer: AnswerChoice, note: string) => {
      const current = sessionRef.current;
      if (!current) throw new Error("Session is not ready.");
      const response = makeRawResponse(current, question, answer, note);
      const next = commit({
        type: "RECORD_RESPONSE",
        response,
        evidence: makeDirectEvidence(response),
        nextIndex: current.currentIndex + 1,
      });
      return { session: next, response };
    },
    [commit],
  );

  const moveTo = useCallback(
    (index: number) => commit({ type: "MOVE_TO", index, at: new Date().toISOString() }),
    [commit],
  );
  const acceptInterpretation = useCallback(
    (output: InterpretAnswerOutput) =>
      commit({ type: "ACCEPT_VALIDATED_INTERPRETATION", output, at: new Date().toISOString() }),
    [commit],
  );
  const appendProbes = useCallback(
    (intents: ProbeIntent[], questionIds: string[]) =>
      commit({ type: "APPEND_PROBES", intents, questionIds, at: new Date().toISOString() }),
    [commit],
  );
  const addTelemetry = useCallback(
    (telemetry: AITelemetry) => commit({ type: "ADD_TELEMETRY", telemetry }),
    [commit],
  );
  const complete = useCallback(
    () => commit({ type: "COMPLETE_SESSION", at: new Date().toISOString() }),
    [commit],
  );
  const markReportGenerating = useCallback(
    () => commit({ type: "REPORT_GENERATING", at: new Date().toISOString() }),
    [commit],
  );
  const setReport = useCallback(
    (report: StructuredReport, status: "READY" | "FALLBACK", error?: string) =>
      commit({ type: "SET_REPORT", report, status, error, at: new Date().toISOString() }),
    [commit],
  );
  const getCurrent = useCallback(() => sessionRef.current, []);

  return {
    session,
    hydrated: session !== null,
    record,
    moveTo,
    acceptInterpretation,
    appendProbes,
    addTelemetry,
    complete,
    markReportGenerating,
    setReport,
    getCurrent,
  };
}
