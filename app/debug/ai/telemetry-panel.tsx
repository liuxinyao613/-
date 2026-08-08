"use client";

import Link from "next/link";
import { Brand } from "@/app/components/brand";
import { AITelemetryRole } from "@/lib/domain/schemas";
import { useBoundarySession } from "@/lib/session/use-boundary-session";

const roleLabels: Record<AITelemetryRole, string> = {
  [AITelemetryRole.ANSWER_INTERPRETER]: "Answer Interpreter",
  [AITelemetryRole.PROBE_PLANNER]: "Probe Planner",
  [AITelemetryRole.REPORT_WRITER]: "Report Writer",
  [AITelemetryRole.QUESTION_GENERATOR]: "Question Generator",
};

export function AITelemetryPanel() {
  const { session, hydrated } = useBoundarySession();
  if (!hydrated || !session) return <main className="debug-page loading-page"><p>正在读取本次测试…</p></main>;

  const totalTokens = session.telemetry.reduce((sum, item) => sum + item.totalTokens, 0);
  const successful = session.telemetry.filter((item) => item.success).length;

  return (
    <main className="debug-page">
      <header className="debug-header"><Brand compact /><span>Development only</span></header>
      <section className="debug-hero">
        <p className="eyebrow">AI Telemetry</p><h1>本次测试的模型调用</h1>
        <p>Session · {session.id}</p>
      </section>
      <section className="debug-summary">
        <article><span>总调用</span><strong>{session.telemetry.length}</strong></article>
        <article><span>成功</span><strong>{successful}</strong></article>
        <article><span>总 token</span><strong>{totalTokens.toLocaleString()}</strong></article>
        <article><span>失败</span><strong>{session.telemetry.length - successful}</strong></article>
      </section>
      <section className="debug-role-grid">
        {Object.values(AITelemetryRole).map((role) => {
          const calls = session.telemetry.filter((item) => item.role === role);
          return (
            <article key={role}>
              <h2>{roleLabels[role]}</h2>
              <p>{calls.length} calls</p>
              <dl><div><dt>Tokens</dt><dd>{calls.reduce((sum, item) => sum + item.totalTokens, 0)}</dd></div><div><dt>Latency</dt><dd>{calls.reduce((sum, item) => sum + item.latencyMs, 0)} ms</dd></div></dl>
            </article>
          );
        })}
      </section>
      <section className="debug-table-shell">
        <table>
          <thead><tr><th>时间</th><th>角色</th><th>模型</th><th>Input</th><th>Cached</th><th>Output</th><th>Reasoning</th><th>Total</th><th>Latency</th><th>结果</th></tr></thead>
          <tbody>{session.telemetry.map((item) => (
            <tr key={item.id}><td>{new Date(item.timestamp).toLocaleTimeString()}</td><td>{roleLabels[item.role]}</td><td>{item.returnedModel ?? item.requestedModel}</td><td>{item.inputTokens}</td><td>{item.cachedInputTokens ?? "—"}</td><td>{item.outputTokens}</td><td>{item.reasoningTokens ?? "—"}</td><td>{item.totalTokens}</td><td>{item.latencyMs} ms</td><td>{item.success ? "成功" : item.errorType}</td></tr>
          ))}</tbody>
        </table>
        {!session.telemetry.length ? <p>还没有模型调用记录。完成带补充短句的回答后再回来查看。</p> : null}
      </section>
      <footer className="debug-footer"><Link href="/assessment">返回测试</Link><Link href="/report">查看报告</Link></footer>
    </main>
  );
}
