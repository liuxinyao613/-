import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { persistAbArtifacts } from "@/lib/synthetic/ab";
import { makeSyntheticRunId, SYNTHETIC_RESULTS_ROOT } from "@/lib/synthetic/persistence";
import {
  SyntheticRunSummarySchema,
  SyntheticSessionResultSchema,
} from "@/lib/synthetic/schemas";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function readRun(runId: string) {
  const directory = path.join(SYNTHETIC_RESULTS_ROOT, "runs", runId);
  const summary = SyntheticRunSummarySchema.parse(
    JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8")),
  );
  const sessionDirectory = path.join(directory, "sessions");
  const files = (await readdir(sessionDirectory)).filter((name) => name.endsWith(".json"));
  const results = await Promise.all(
    files.map(async (name) =>
      SyntheticSessionResultSchema.parse(
        JSON.parse(await readFile(path.join(sessionDirectory, name), "utf8")),
      ),
    ),
  );
  return { summary, results };
}

async function main(): Promise<void> {
  const sol = await readRun(argument("--sol-run"));
  const deepseek = await readRun(argument("--deepseek-run"));
  const artifacts = await persistAbArtifacts({
    abRunId: makeSyntheticRunId("ab", "comparison"),
    solSummary: sol.summary,
    deepseekSummary: deepseek.summary,
    solResults: sol.results,
    deepseekResults: deepseek.results,
  });
  console.log(JSON.stringify(artifacts));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
