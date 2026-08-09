"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/app/components/brand";
import { questionById } from "@/data/questions";
import { AIClientError, postAI } from "@/lib/ai/client";
import { WriteReportOutputSchema } from "@/lib/ai/contracts";
import {
  answerLabels,
  dimensionLabels,
  dimensionShortLabels,
} from "@/lib/domain/labels";
import type { Session } from "@/lib/domain/schemas";
import { buildReportFacts, buildStructuredReport } from "@/lib/report/build-report";
import { clearSession } from "@/lib/session/storage";
import { useBoundarySession } from "@/lib/session/use-boundary-session";

function EmptyFinding({ children }: { children: React.ReactNode }) {
  return <p className="empty-finding">{children}</p>;
}

function EvidencePeek({ evidenceIds, session }: { evidenceIds: string[]; session: Session }) {
  const items = evidenceIds.flatMap((id) => {
    const evidence = session.evidence.find((item) => item.id === id);
    if (!evidence) return [];
    const response = session.rawResponses.find((item) => item.id === evidence.rawResponseId);
    if (!response) return [];
    return [{ evidence, response }];
  });
  if (!items.length) return null;

  return (
    <details className="evidence-peek">
      <summary>查看依据 · {items.length}</summary>
      <div>
        {items.slice(0, 5).map(({ evidence, response }) => (
          <article key={evidence.id}>
            <p>{questionById.get(response.questionId)?.text ?? response.questionTextSnapshot}</p>
            <span>{answerLabels[response.answer]}</span>
            {response.note ? <q>{response.note}</q> : null}
            {evidence.kind === "AI_INTERPRETATION" ? <small>{evidence.supports}</small> : null}
          </article>
        ))}
      </div>
    </details>
  );
}

export function ReportExperience() {
  const router = useRouter();
  const {
    session,
    hydrated,
    addTelemetry,
    markReportGenerating,
    setReport,
    getCurrent,
  } = useBoundarySession();

  const generateReport = useCallback(async () => {
    const current = getCurrent();
    if (!current || current.status !== "COMPLETED") return;
    markReportGenerating();
    const facts = buildReportFacts(current, new Date(current.completedAt ?? current.updatedAt));
    try {
      const result = await postAI(
        "/api/ai/report",
        { session: current, facts },
        WriteReportOutputSchema,
      );
      addTelemetry(result.telemetry);
      setReport(result.data.report, "READY");
    } catch (error) {
      if (error instanceof AIClientError && error.telemetry) addTelemetry(error.telemetry);
      const latest = getCurrent() ?? current;
      const fallbackFacts = buildReportFacts(
        latest,
        new Date(latest.completedAt ?? latest.updatedAt),
      );
      setReport(
        buildStructuredReport(latest, fallbackFacts),
        "FALLBACK",
        error instanceof AIClientError ? error.errorType : "REPORT_WRITER_FAILED",
      );
    }
  }, [addTelemetry, getCurrent, markReportGenerating, setReport]);

  useEffect(() => {
    if (!session || session.status !== "COMPLETED" || session.reportStatus !== "IDLE") return;
    const timer = window.setTimeout(() => void generateReport(), 0);
    return () => window.clearTimeout(timer);
  }, [generateReport, session]);

  if (!hydrated || !session) {
    return (
      <main className="report-page loading-page">
        <div className="quiet-loader" role="status"><span />正在整理你的边界地图…</div>
      </main>
    );
  }

  if (session.status !== "COMPLETED") {
    return (
      <main className="report-page incomplete-report">
        <Brand />
        <section className="incomplete-card">
          <p className="eyebrow">报告还在等你的回答</p>
          <h1>先完成这次边界测试。</h1>
          <p>你的原始回答和当前进度已经保存在这台设备上。</p>
          <Link className="primary-action" href="/assessment">继续测试 <span>→</span></Link>
        </section>
      </main>
    );
  }

  if (!session.structuredReport || session.reportStatus === "GENERATING") {
    return (
      <main className="report-page loading-page">
        <div className="flow-processing-card" role="status">
          <span className="flow-processing-orbit" aria-hidden="true" />
          <p>正在根据 Evidence 生成结构化报告…</p>
          <small>Report Writer 只接收程序整理后的 ReportFacts。</small>
        </div>
      </main>
    );
  }

  const report = session.structuredReport;
  const restart = () => {
    if (!window.confirm("重新开始会清除当前浏览器中的这次测试记录。确定继续吗？")) return;
    clearSession();
    router.push("/assessment");
  };

  return (
    <main className="report-page">
      <header className="report-header">
        <Brand compact />
        <div className="report-actions">
          {session.reportStatus === "FALLBACK" ? (
            <button onClick={() => void generateReport()} type="button">重新生成 AI 报告</button>
          ) : null}
          <button onClick={() => window.print()} type="button">打印 / 保存 PDF</button>
          <button onClick={restart} type="button">重新测试</button>
        </div>
      </header>

      {session.reportStatus === "FALLBACK" ? (
        <p className="report-fallback-note">AI Report Writer 暂不可用，当前显示结构化事实报告。原始回答未受影响。{session.reportError ? ` · ${session.reportError}` : ""}</p>
      ) : null}

      <section className="report-hero">
        <div>
          <p className="eyebrow">Phase 2 · {report.generatedBy === "AI" ? "AI Structured Report" : "Facts Fallback"}</p>
          <p className="boundary-label-caption">你的边界称谓</p>
          <h1>{report.boundaryLabel}</h1>
          <p className="report-headline">{report.headline}</p>
          <p className="report-snapshot">{report.overview}</p>
        </div>
        <aside className="completion-seal" aria-label="报告覆盖情况">
          <span>已完成</span><p>原始回答<br />完整保留</p>
        </aside>
      </section>

      <section className="report-section principles-section" aria-labelledby="principles-title">
        <div className="report-section-heading"><p>01</p><div><span>Core principles</span><h2 id="principles-title">核心原则</h2></div></div>
        <div className="principles-grid">
          {report.corePrinciples.map((principle) => (
            <article key={`${principle.dimension}-${principle.title}`}>
              <span>{dimensionShortLabels[principle.dimension]}</span>
              <h3>{principle.title}</h3><p>{principle.description}</p>
              <EvidencePeek evidenceIds={principle.evidenceIds} session={session} />
            </article>
          ))}
        </div>
      </section>

      <section className="report-section" aria-labelledby="map-title">
        <div className="report-section-heading"><p>02</p><div><span>11 dimensions</span><h2 id="map-title">11 维边界地图</h2></div></div>
        <p className="section-intro">每一格是类别判断，不是高低分。“可以”只说明当前情境暂未明确越界。</p>
        <div className="dimension-map">
          {report.dimensionMap.map((state) => (
            <article className="dimension-card" data-position={state.position} key={state.dimension}>
              <div className="dimension-card-top"><span className="dimension-monogram">{dimensionShortLabels[state.dimension]}</span><span className="position-pill">{state.label}</span></div>
              <h3>{dimensionLabels[state.dimension]}</h3><p>{state.summary}</p>
              <EvidencePeek evidenceIds={state.evidenceIds} session={session} />
            </article>
          ))}
        </div>
      </section>

      <div className="paired-sections">
        <section className="report-section compact-report-section" aria-labelledby="flips-title">
          <div className="report-section-heading"><p>03</p><div><span>Boundary flips</span><h2 id="flips-title">Boundary Flips</h2></div></div>
          {report.boundaryFlips.length ? <div className="finding-list">{report.boundaryFlips.map((flip) => (
            <article key={flip.id}><span>{dimensionLabels[flip.dimension]}</span><h3>可接受 <b aria-hidden="true">↔</b> 不可接受</h3><p>{flip.trigger}</p><EvidencePeek evidenceIds={flip.evidenceIds} session={session} /></article>
          ))}</div> : <EmptyFinding>目前没有足够证据描述边界翻转；这不代表它不存在。</EmptyFinding>}
        </section>

        <section className="report-section compact-report-section" aria-labelledby="must-title">
          <div className="report-section-heading"><p>04</p><div><span>Must have</span><h2 id="must-title">Must Have</h2></div></div>
          {report.mustHaves.length ? <div className="finding-list numbered-findings">{report.mustHaves.map((item, index) => (
            <article key={item.dimension}><span>0{index + 1} · {dimensionLabels[item.dimension]}</span><p>{item.statement}</p><EvidencePeek evidenceIds={item.evidenceIds} session={session} /></article>
          ))}</div> : <EmptyFinding>当前 Evidence 还不足以确认 Must Have。</EmptyFinding>}
        </section>
      </div>

      <section className="report-section hidden-cost-section" aria-labelledby="cost-title">
        <div className="report-section-heading"><p>05</p><div><span>Hidden cost</span><h2 id="cost-title">Hidden Cost</h2></div></div>
        <p className="section-intro">“可以承受”和“长期可持续”是两件不同的事。低置信线索不会被写成结论。</p>
        {report.hiddenCosts.length ? <div className="cost-grid">{report.hiddenCosts.map((cost) => (
          <article key={cost.id}><div><span>{dimensionLabels[cost.dimension]}</span><em>{cost.status === "OBSERVED" ? "Evidence" : "待验证"}</em></div><h3>{cost.statement}</h3><p>{cost.longTermRisk}</p><EvidencePeek evidenceIds={cost.evidenceIds} session={session} /></article>
        ))}</div> : <EmptyFinding>本次回答中还没有足够 Evidence 描述 Hidden Cost。</EmptyFinding>}
      </section>

      <section className="report-section tensions-section" aria-labelledby="tensions-title">
        <div className="report-section-heading"><p>06</p><div><span>Tensions</span><h2 id="tensions-title">边界张力</h2></div></div>
        {report.tensions.length ? <div className="finding-list">{report.tensions.map((tension) => (
          <article key={tension.title}><h3>{tension.title}</h3><p>{tension.description}</p><EvidencePeek evidenceIds={tension.evidenceIds} session={session} /></article>
        ))}</div> : <EmptyFinding>目前没有足够证据形成跨维度张力结论。</EmptyFinding>}
      </section>

      <section className="report-section unresolved-section" aria-labelledby="unknown-title">
        <div className="report-section-heading"><p>07</p><div><span>Unresolved</span><h2 id="unknown-title">未确定区域</h2></div></div>
        {report.unresolvedAreas.length ? <div className="unknown-list">{report.unresolvedAreas.map((area) => (
          <article key={area.dimension}><span>{dimensionLabels[area.dimension]}</span><div><p>{area.prompt}</p><EvidencePeek evidenceIds={area.evidenceIds} session={session} /></div></article>
        ))}</div> : <EmptyFinding>11 个维度在本轮都有可描述状态；这不意味着所有边界永久确定。</EmptyFinding>}
      </section>

      <section className="report-section evidence-section" aria-labelledby="evidence-title">
        <div className="report-section-heading"><p>08</p><div><span>Evidence</span><h2 id="evidence-title">为什么这么说？</h2></div></div>
        <p className="section-intro">报告只引用每题最新回答；旧 RawResponse 仍完整保留在 Session 中。</p>
        <div className="evidence-list">
          {report.evidencePanels.map((panel) => (
            <details key={panel.dimension}><summary><span>{dimensionLabels[panel.dimension]}</span><small>{panel.items.length} 条回答</small></summary>
              <div className="evidence-body"><p>{panel.explanation}</p>{panel.items.length ? panel.items.map((item) => (
                <article key={item.rawResponseId}><p>{item.question}</p><div><strong>{answerLabels[item.answer]}</strong>{item.note ? <q>{item.note}</q> : <span>未补充短句</span>}</div></article>
              )) : <p className="no-evidence">这一维度没有可引用的回答。</p>}</div>
            </details>
          ))}
        </div>
      </section>

      <footer className="report-footer"><p>{report.disclaimer}</p><p className="share-line">{report.shareLine}</p><Link href="/">返回开始页</Link></footer>
    </main>
  );
}
