"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/app/components/brand";
import { questionById } from "@/data/questions";
import {
  fallbackProbePlan,
  selectAdaptiveQuestions,
  shouldStopAdaptive,
} from "@/lib/adaptive/flow";
import { AIClientError, postAI } from "@/lib/ai/client";
import { PlanProbeOutputSchema } from "@/lib/ai/contracts";
import { useBackgroundAnswerAnalysis } from "@/lib/ai/use-background-answer-analysis";
import {
  answerLabels,
  answerPlaceholders,
  dimensionLabels,
} from "@/lib/domain/labels";
import {
  AnswerChoice,
  type Question,
  type RawResponse,
  type Session,
} from "@/lib/domain/schemas";
import { buildReportFacts } from "@/lib/report/build-report";
import { latestResponses } from "@/lib/session/session";
import { useBoundarySession } from "@/lib/session/use-boundary-session";

const primaryAnswers = [
  AnswerChoice.CAN_ACCEPT,
  AnswerChoice.CANNOT_ACCEPT,
  AnswerChoice.DEPENDS,
  AnswerChoice.UNSURE,
] as const;

function QuestionStep({
  question,
  initialResponse,
  onSubmit,
  onSkip,
  onBack,
  isFirst,
}: {
  question: Question;
  initialResponse?: RawResponse;
  onSubmit: (answer: AnswerChoice, note: string) => void;
  onSkip: () => void;
  onBack: () => void;
  isFirst: boolean;
}) {
  const initialAnswer =
    initialResponse && initialResponse.answer !== AnswerChoice.SKIPPED
      ? initialResponse.answer
      : undefined;
  const [answer, setAnswer] = useState<AnswerChoice | undefined>(initialAnswer);
  const [note, setNote] = useState(initialResponse?.note ?? "");
  const placeholder = answer
    ? answerPlaceholders[answer]
    : "先选择一个回答，这里的提示会随之变化……";

  return (
    <article className="question-card">
      <div className="question-meta">
        <span>{dimensionLabels[question.dimension]}</span>
        {initialResponse ? <span className="revision-note">再次回答会保留上一版原文</span> : null}
      </div>
      <h1>{question.text}</h1>
      {question.context ? <p className="question-context">{question.context}</p> : null}

      <fieldset className="answer-fieldset">
        <legend className="sr-only">选择你的接受边界</legend>
        <div className="answer-grid">
          {primaryAnswers.map((choice) => (
            <button
              aria-pressed={answer === choice}
              className="answer-button"
              data-selected={answer === choice}
              key={choice}
              onClick={() => setAnswer(choice)}
              type="button"
            >
              <span className="answer-radio" aria-hidden="true" />
              {answerLabels[choice]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="note-field">
        <span>补充一句 <em>可选 · 会用于理解条件与长期可持续性</em></span>
        <textarea
          maxLength={280}
          onChange={(event) => setNote(event.target.value)}
          placeholder={placeholder}
          rows={2}
          value={note}
        />
        <small>{note.length}/280</small>
      </label>

      <div className="question-actions">
        <button className="back-action" disabled={isFirst} onClick={onBack} type="button">← 上一题</button>
        <button className="skip-action" onClick={onSkip} type="button">跳过此题</button>
        <button className="next-action" disabled={!answer} onClick={() => answer && onSubmit(answer, note)} type="button">
          下一题 <span aria-hidden="true">→</span>
        </button>
      </div>
    </article>
  );
}

export function AssessmentExperience() {
  const router = useRouter();
  const {
    session,
    hydrated,
    record,
    moveTo,
    acceptInterpretation,
    appendProbes,
    addTelemetry,
    complete,
    getCurrent,
  } = useBoundarySession();
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const flowInFlight = useRef(false);
  const advancingQuestion = useRef<string | null>(null);
  const {
    enqueue: enqueueBackgroundAnalysis,
    drain: drainBackgroundAnalysis,
    pendingCount: pendingAnalysisCount,
  } = useBackgroundAnswerAnalysis({
    session,
    hydrated,
    getCurrent,
    addTelemetry,
    acceptInterpretation,
  });

  useEffect(() => {
    advancingQuestion.current = null;
  }, [session?.currentIndex]);

  const runPlanner = useCallback(
    async (baseSession: Session) => {
      if (flowInFlight.current) return;
      flowInFlight.current = true;
      setProcessingLabel("正在汇总各维度分析，准备下一组情境…");
      try {
        await drainBackgroundAnalysis();
        let current = getCurrent() ?? baseSession;
        const currentFacts = buildReportFacts(current);
        let plan;
        try {
          const result = await postAI(
            "/api/ai/plan",
            { session: current, facts: currentFacts },
            PlanProbeOutputSchema,
          );
          addTelemetry(result.telemetry);
          current = getCurrent() ?? current;
          plan = result.data;
        } catch (error) {
          if (error instanceof AIClientError && error.telemetry) addTelemetry(error.telemetry);
          current = getCurrent() ?? current;
          plan = fallbackProbePlan(current, buildReportFacts(current));
        }

        let selected = selectAdaptiveQuestions(current, plan.intents);
        if (!selected.length && current.rawResponses.filter((item) => item.stageSnapshot === "ADAPTIVE").length < current.adaptiveConfig.minAdaptive) {
          const fallback = fallbackProbePlan(current, buildReportFacts(current));
          selected = selectAdaptiveQuestions(current, fallback.intents);
          plan = { ...fallback, stop: false };
        }

        if (shouldStopAdaptive(current, plan.stop, selected.length) || !selected.length) {
          complete();
          router.push("/report");
          return;
        }
        appendProbes(plan.intents, selected.map((question) => question.id));
      } finally {
        flowInFlight.current = false;
        setProcessingLabel(null);
      }
    },
    [addTelemetry, appendProbes, complete, drainBackgroundAnalysis, getCurrent, router],
  );

  const continueFlow = useCallback(
    async (baseSession: Session) => {
      const current = getCurrent() ?? baseSession;
      if (current.status === "COMPLETED") {
        router.push("/report");
        return;
      }
      if (current.currentIndex < current.questionOrder.length) return;
      await runPlanner(current);
    },
    [getCurrent, router, runPlanner],
  );

  useEffect(() => {
    if (!session || session.status === "COMPLETED") return;
    if (session.currentIndex < session.questionOrder.length) return;
    const timer = window.setTimeout(() => void continueFlow(session), 0);
    return () => window.clearTimeout(timer);
  }, [continueFlow, session]);

  if (!hydrated || !session) {
    return (
      <main className="assessment-page loading-page">
        <div className="quiet-loader" role="status"><span />正在恢复你的测试进度…</div>
      </main>
    );
  }

  if (processingLabel || session.currentIndex >= session.questionOrder.length) {
    return (
      <main className="assessment-page loading-page">
        <div className="flow-processing-card" role="status">
          <span className="flow-processing-orbit" aria-hidden="true" />
          <p>{processingLabel ?? "正在恢复自适应流程…"}</p>
          <small>原始回答已经先保存；AI 失败也不会丢失。</small>
        </div>
      </main>
    );
  }

  const questionId = session.questionOrder[session.currentIndex];
  const question = questionById.get(questionId);
  if (!question) {
    return <main className="assessment-page loading-page"><p>题目数据暂不可用。</p></main>;
  }
  const latest = latestResponses(session.rawResponses).get(question.id);
  const isCore = session.currentIndex < 24;
  const stageLabel = isCore ? "Core-24" : "Adaptive Question Bank";
  const stageDetail = isCore ? "固定核心题" : "AI 规划意图 · 程序从固定题库选题";
  const expectedTotal = session.adaptiveConfig.targetTotal;

  const advance = (answer: AnswerChoice, note: string) => {
    if (advancingQuestion.current === question.id) return;
    advancingQuestion.current = question.id;
    try {
      const recorded = record(question, answer, note);
      enqueueBackgroundAnalysis(question, recorded.response);
      void continueFlow(recorded.session);
    } catch (error) {
      advancingQuestion.current = null;
      throw error;
    }
  };

  return (
    <main className="assessment-page">
      <header className="assessment-header">
        <Brand compact />
        <div aria-live="polite" className="save-state" data-analyzing={pendingAnalysisCount > 0}>
          <span aria-hidden="true" />
          {pendingAnalysisCount > 0
            ? `原始回答已保存 · AI 后台整理 ${pendingAnalysisCount} 条`
            : "原始回答已保存到本机"}
        </div>
      </header>

      <section className="progress-shell" aria-label="测试进度">
        <div className="progress-copy">
          <div><strong>{stageLabel}</strong><span>{stageDetail}</span></div>
          <p><strong>{session.currentIndex + 1}</strong> / 预计 {expectedTotal}</p>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${Math.min(100, ((session.currentIndex + 1) / expectedTotal) * 100)}%` }} />
        </div>
      </section>

      {session.currentIndex === 24 ? (
        <p className="adaptive-callout">Core-24 已完成。接下来会根据当前 Evidence，从固定题库选择更值得澄清的情境。</p>
      ) : null}

      <QuestionStep
        initialResponse={latest}
        isFirst={session.currentIndex === 0}
        key={`${question.id}-${latest?.id ?? "new"}`}
        onBack={() => moveTo(session.currentIndex - 1)}
        onSkip={() => advance(AnswerChoice.SKIPPED, "")}
        onSubmit={advance}
        question={question}
      />

      <p className="assessment-footnote">“可以”不等于喜欢 · “我不知道”不会被折算成中间值 · AI 只解释第二层语义</p>
    </main>
  );
}
