import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the pre-test teaching page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Relationship Boundary Map/);
  assert.match(html, /先看见边界/);
  assert.match(html, /可以/);
  assert.match(html, /不可以/);
  assert.match(html, /看情况/);
  assert.match(html, /我不知道/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("assessment and report routes are available", async () => {
  const [assessment, report] = await Promise.all([
    render("/assessment"),
    render("/report"),
  ]);

  assert.equal(assessment.status, 200);
  assert.equal(report.status, 200);
  assert.match(await assessment.text(), /正在恢复你的测试进度/);
  assert.match(await report.text(), /正在整理你的边界地图/);
});
