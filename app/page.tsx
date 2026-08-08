import type { Metadata } from "next";
import { Brand } from "./components/brand";
import { HomeActions } from "./components/home-actions";

export const metadata: Metadata = {
  title: "开始前 · Relationship Boundary Map",
  description: "在具体关系情境里，辨认你的接受边界、条件与未知区域。",
};

const answerTeaching = [
  {
    label: "可以",
    detail: "只表示当前情境没有明确越过接受边界，不等于喜欢、赞成或希望它发生。",
  },
  {
    label: "不可以",
    detail: "表示这个具体情境已经越过你的接受边界，不是在判断谁对谁错。",
  },
  {
    label: "看情况",
    detail: "表示答案依赖某个条件。那句补充文字，正是用来写下关键条件的。",
  },
  {
    label: "我不知道",
    detail: "保留真正的不确定。系统不会把它换算成中间值，也不会替你猜答案。",
  },
];

export default function Home() {
  return (
    <main className="home-page">
      <header className="site-header home-header">
        <Brand />
        <span className="phase-chip">Phase 1 · 个人边界</span>
      </header>

      <section className="hero-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">一张没有总分的关系边界地图</p>
          <h1 id="hero-title">先看见边界，<br />再讨论关系。</h1>
          <p className="hero-lead">
            这不是人格测试，也不判断你的关系是否“健康”。你会依次面对 32
            个具体情境，记录哪里可以、哪里不可以、哪些地方取决于条件，以及哪些你还不知道。
          </p>
          <HomeActions />
          <p className="local-note">无需登录 · 原始回答保存在当前浏览器 · 约 10–15 分钟</p>
          <div className="ai-privacy-note">
            <strong>关于补充文字</strong>
            <p>补充文字会发送给你配置的 AI 服务，用于理解回答、调整后续问题和生成报告。建议不要填写真实姓名、电话号码、账号或住址等可识别个人信息。</p>
          </div>
        </div>

        <aside className="map-preview" aria-label="边界地图示意">
          <p className="map-preview-kicker">你最终会得到</p>
          <div className="map-orbit" aria-hidden="true">
            <span className="orbit-center">你的<br />边界</span>
            <span className="orbit-label orbit-label-one">条件</span>
            <span className="orbit-label orbit-label-two">底线</span>
            <span className="orbit-label orbit-label-three">未知</span>
            <span className="orbit-label orbit-label-four">代价</span>
          </div>
          <p className="map-preview-caption">
            11 个维度彼此并列，没有“最好”的形状。
          </p>
        </aside>
      </section>

      <section className="teaching-section" aria-labelledby="answers-title">
        <div className="section-heading compact-heading">
          <p className="eyebrow">开始前，先校准四个按钮</p>
          <h2 id="answers-title">回答的是接受边界，不是偏好。</h2>
        </div>
        <div className="answer-teaching-grid">
          {answerTeaching.map((item, index) => (
            <article className="teaching-card" key={item.label}>
              <span className="teaching-index">0{index + 1}</span>
              <h3>{item.label}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="answering-guide" aria-labelledby="guide-title">
        <div>
          <p className="eyebrow">怎样回答更有用</p>
          <h2 id="guide-title">把你带回真实情境。</h2>
        </div>
        <ol className="guide-list">
          <li>
            <span>01</span>
            <p><strong>按长期相处回答。</strong>不是“偶尔一次能不能忍”，而是这种模式持续存在时是否仍可接受。</p>
          </li>
          <li>
            <span>02</span>
            <p><strong>优先写下那个条件。</strong>一句短话就够，比如“只限紧急情况”或“需要事先说清”。</p>
          </li>
          <li>
            <span>03</span>
            <p><strong>允许答案暂时空着。</strong>不确定本身就是地图的一部分，可以跳过，也可以选“我不知道”。</p>
          </li>
        </ol>
      </section>

      <footer className="home-footer">
        <Brand compact />
        <p>Phase 2 · Core-24 + 固定题库自适应追问 · AI 输出经过结构化验证</p>
      </footer>
    </main>
  );
}
