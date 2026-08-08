import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  SyntheticRunSummary,
  SyntheticSessionResult,
} from "./schemas";

export const SYNTHETIC_RESULTS_ROOT = path.resolve(
  process.cwd(),
  "test-results",
  "synthetic",
);

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function atomicWrite(target: string, contents: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, target);
}

export function makeSyntheticRunId(
  mode: string,
  target: string,
  now = new Date(),
): string {
  return `${now.toISOString().replace(/[:.]/g, "-")}_${safeSegment(mode)}_${safeSegment(target)}`;
}

export async function createSyntheticRunDirectory(runId: string): Promise<string> {
  const directory = path.join(SYNTHETIC_RESULTS_ROOT, "runs", safeSegment(runId));
  await mkdir(path.join(directory, "sessions"), { recursive: true });
  return directory;
}

export async function persistSyntheticSession(
  runDirectory: string,
  result: SyntheticSessionResult,
): Promise<string> {
  const target = path.join(
    runDirectory,
    "sessions",
    `${safeSegment(result.persona.personaId)}.json`,
  );
  await atomicWrite(target, `${JSON.stringify(result, null, 2)}\n`);
  return target;
}

export async function persistSyntheticRun(input: {
  runDirectory: string;
  summary: SyntheticRunSummary;
  summaryMarkdown: string;
  results: SyntheticSessionResult[];
  promoteSummary?: boolean;
}): Promise<void> {
  await atomicWrite(
    path.join(input.runDirectory, "summary.json"),
    `${JSON.stringify(input.summary, null, 2)}\n`,
  );
  await atomicWrite(
    path.join(input.runDirectory, "SYNTHETIC_TEST_SUMMARY.md"),
    input.summaryMarkdown,
  );
  await atomicWrite(
    path.join(input.runDirectory, "sessions.jsonl"),
    `${input.results.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  if (input.promoteSummary) {
    await atomicWrite(
      path.join(SYNTHETIC_RESULTS_ROOT, "SYNTHETIC_TEST_SUMMARY.md"),
      input.summaryMarkdown,
    );
    await atomicWrite(
      path.join(SYNTHETIC_RESULTS_ROOT, "latest-summary.json"),
      `${JSON.stringify(input.summary, null, 2)}\n`,
    );
  }
}

export async function writeSyntheticArtifact(
  relativePath: string,
  contents: string,
): Promise<string> {
  const target = path.resolve(SYNTHETIC_RESULTS_ROOT, relativePath);
  const relative = path.relative(SYNTHETIC_RESULTS_ROOT, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Synthetic artifact path escaped its result root.");
  }
  await atomicWrite(target, contents);
  return target;
}
