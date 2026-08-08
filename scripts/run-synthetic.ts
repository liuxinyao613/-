import path from "node:path";
import {
  abPersonaIds,
  smokePersonaIds,
  syntheticPersonaById,
  syntheticPersonas,
} from "@/data/synthetic-personas";
import { persistAbArtifacts } from "@/lib/synthetic/ab";
import {
  SYNTHETIC_DEFAULT_CONCURRENCY,
  type ProductTarget,
} from "@/lib/synthetic/config";
import {
  createSyntheticRunDirectory,
  makeSyntheticRunId,
  persistSyntheticRun,
  persistSyntheticSession,
} from "@/lib/synthetic/persistence";
import { runSyntheticSession } from "@/lib/synthetic/runner";
import type {
  SyntheticPersona,
  SyntheticRunSummary,
  SyntheticSessionResult,
} from "@/lib/synthetic/schemas";
import { AIUserSimulator } from "@/lib/synthetic/simulator";
import {
  buildSyntheticRunSummary,
  syntheticSummaryMarkdown,
} from "@/lib/synthetic/summary";

type Mode = "smoke" | "standard" | "stress" | "ab";

type CliOptions = {
  mode: Mode;
  provider: ProductTarget;
  concurrency: number;
  personaId?: string;
  confirmStress: boolean;
  list: boolean;
};

function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
}

function parseOptions(argv: string[]): CliOptions {
  const valueAfter = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const mode = (valueAfter("--mode") ?? "smoke") as Mode;
  const provider = (valueAfter("--provider") ?? "sol") as ProductTarget;
  const concurrency = Number(valueAfter("--concurrency") ?? SYNTHETIC_DEFAULT_CONCURRENCY);
  if (!["smoke", "standard", "stress", "ab"].includes(mode)) {
    throw new Error(`Unsupported --mode ${mode}.`);
  }
  if (!["sol", "deepseek"].includes(provider)) {
    throw new Error(`Unsupported --provider ${provider}.`);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be an integer between 1 and 8.");
  }
  return {
    mode,
    provider,
    concurrency,
    personaId: valueAfter("--persona"),
    confirmStress: argv.includes("--confirm-stress"),
    list: argv.includes("--list"),
  };
}

function personasFor(options: CliOptions): SyntheticPersona[] {
  if (options.personaId) {
    const persona = syntheticPersonaById.get(options.personaId);
    if (!persona) throw new Error(`Unknown persona: ${options.personaId}.`);
    return [persona];
  }
  if (options.mode === "smoke") {
    return smokePersonaIds.map((id) => syntheticPersonaById.get(id)!);
  }
  if (options.mode === "ab") {
    return abPersonaIds.map((id) => syntheticPersonaById.get(id)!);
  }
  if (options.mode === "standard") return syntheticPersonas.slice(0, 20);
  if (!options.confirmStress) {
    throw new Error("Stress mode is disabled by default. Add --confirm-stress to run 50 sessions.");
  }
  return Array.from({ length: 50 }, (_, index) =>
    syntheticPersonas[index % syntheticPersonas.length],
  );
}

async function runWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function consume(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => consume()),
  );
  return results;
}

async function runTarget(input: {
  mode: Mode;
  target: ProductTarget;
  personas: SyntheticPersona[];
  simulator: AIUserSimulator;
  concurrency: number;
  runId?: string;
}): Promise<{
  runId: string;
  summary: SyntheticRunSummary;
  results: SyntheticSessionResult[];
}> {
  const runId = input.runId ?? makeSyntheticRunId(input.mode, input.target);
  const runDirectory = await createSyntheticRunDirectory(runId);
  const startedAt = new Date().toISOString();
  console.log(
    `[synthetic] ${runId}: ${input.personas.length} personas, product=${input.target}, concurrency=${input.concurrency}`,
  );
  const results = await runWithConcurrency(
    input.personas,
    input.concurrency,
    async (persona, index) => {
      console.log(
        `[synthetic] start ${index + 1}/${input.personas.length} ${persona.personaId} (${input.target})`,
      );
      const result = await runSyntheticSession({
        runId,
        persona,
        productTarget: input.target,
        simulator: input.simulator,
        onProgress(message) {
          const match = message.match(/question (\d+)$/);
          const questionNumber = Number(match?.[1] ?? 0);
          if (questionNumber === 1 || questionNumber % 5 === 0) {
            console.log(`[synthetic] progress ${message}`);
          }
        },
      });
      const saved = await persistSyntheticSession(runDirectory, result);
      console.log(
        `[synthetic] done ${persona.personaId}: questions=${result.metrics.totalQuestions}, tokens=${result.metrics.totalTokens}, errors=${result.errors.length}, saved=${path.relative(process.cwd(), saved)}`,
      );
      return result;
    },
  );
  const summary = buildSyntheticRunSummary({
    runId,
    mode: input.mode,
    productTarget: input.target,
    results,
    startedAt,
    concurrency: input.concurrency,
  });
  const markdown = syntheticSummaryMarkdown(summary, results);
  await persistSyntheticRun({
    runDirectory,
    summary,
    summaryMarkdown: markdown,
    results,
    promoteSummary: input.mode !== "ab" && input.target === "sol",
  });
  console.log(
    `[synthetic] complete ${runId}: completed=${summary.completed}/${results.length}, errorRate=${(summary.schemaOrApiErrorRate * 100).toFixed(1)}%`,
  );
  return { runId, summary, results };
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const options = parseOptions(process.argv.slice(2));
  if (options.list) {
    syntheticPersonas.forEach((persona) =>
      console.log(`${persona.personaId}\t${persona.archetypes.join(",")}\t${persona.name}`),
    );
    return;
  }
  const personas = personasFor(options);
  const simulator = new AIUserSimulator();

  if (options.mode !== "ab") {
    await runTarget({
      mode: options.mode,
      target: options.provider,
      personas,
      simulator,
      concurrency: options.concurrency,
    });
    return;
  }

  const abRunId = makeSyntheticRunId("ab", "comparison");
  const sol = await runTarget({
    mode: "ab",
    target: "sol",
    personas,
    simulator,
    concurrency: options.concurrency,
    runId: `${abRunId}_sol`,
  });

  let deepseek:
    | Awaited<ReturnType<typeof runTarget>>
    | undefined;
  try {
    deepseek = await runTarget({
      mode: "ab",
      target: "deepseek",
      personas,
      simulator,
      concurrency: options.concurrency,
      runId: `${abRunId}_deepseek`,
    });
  } catch (error) {
    console.error(
      `[synthetic] DeepSeek A/B failed without blocking Sol artifacts: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  if (deepseek) {
    const artifacts = await persistAbArtifacts({
      abRunId,
      solSummary: sol.summary,
      deepseekSummary: deepseek.summary,
      solResults: sol.results,
      deepseekResults: deepseek.results,
    });
    console.log(
      `[synthetic] A/B artifacts: ${path.relative(process.cwd(), artifacts.summaryPath)}; ${path.relative(process.cwd(), artifacts.reviewPath)}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
