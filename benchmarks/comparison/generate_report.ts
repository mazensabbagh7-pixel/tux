import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as vega from "vega";
import * as vl from "vega-lite";

export interface TrialResult {
  agent: string;
  task_id: string;
  passed: boolean;
  score: number;
  n_input_tokens: number;
  n_output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  duration_sec: number;
}

export interface AgentSummary {
  agent: string;
  tasks: number;
  passes: number;
  passRatePct: number;
  totalCostUsd: number;
  avgCostUsd: number;
  totalInputTokens: number;
  avgInputTokens: number;
  totalOutputTokens: number;
  avgOutputTokens: number;
  totalTokens: number;
  avgTokens: number;
  totalDurationSec: number;
  avgDurationSec: number;
  medianDurationSec: number;
  tokensPerDollar: number;
  passesPerDollar: number;
  tokensPerSecond: number;
}

type ChartRenderer = (vlSpec: vl.TopLevelSpec) => Promise<string>;
type ChartDatum = Record<string, number | string>;

interface ChartDefinition {
  readonly specFile: string;
  readonly outputFile: string;
  readonly valuesFromSummaries: (summaries: AgentSummary[]) => ChartDatum[];
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CHART_SPECS_DIR = resolve(SCRIPT_DIR, "chart_specs");

const CHART_DEFINITIONS: readonly ChartDefinition[] = [
  {
    specFile: "pass_rate.json",
    outputFile: "pass_rate.svg",
    valuesFromSummaries: (summaries) =>
      summaries.map((summary) => ({
        agent: summary.agent,
        pass_rate: summary.passRatePct,
      })),
  },
  {
    specFile: "token_usage.json",
    outputFile: "token_usage.svg",
    valuesFromSummaries: (summaries) =>
      summaries.flatMap((summary) => [
        {
          agent: summary.agent,
          token_type: "input",
          tokens: summary.totalInputTokens,
        },
        {
          agent: summary.agent,
          token_type: "output",
          tokens: summary.totalOutputTokens,
        },
      ]),
  },
  {
    specFile: "cost_comparison.json",
    outputFile: "cost_comparison.svg",
    valuesFromSummaries: (summaries) =>
      summaries.map((summary) => ({
        agent: summary.agent,
        total_cost_usd: summary.totalCostUsd,
      })),
  },
  {
    specFile: "duration_comparison.json",
    outputFile: "duration_comparison.svg",
    valuesFromSummaries: (summaries) =>
      summaries.map((summary) => ({
        agent: summary.agent,
        avg_duration_sec: summary.avgDurationSec,
      })),
  },
] as const;

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  return sorted[midpoint];
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function isTrialResult(value: unknown): value is TrialResult {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.agent === "string" &&
    typeof candidate.task_id === "string" &&
    typeof candidate.passed === "boolean" &&
    typeof candidate.score === "number" &&
    typeof candidate.n_input_tokens === "number" &&
    typeof candidate.n_output_tokens === "number" &&
    typeof candidate.total_tokens === "number" &&
    typeof candidate.cost_usd === "number" &&
    typeof candidate.duration_sec === "number"
  );
}

function parseTrialResults(raw: string): TrialResult[] {
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed) || !parsed.every(isTrialResult)) {
    throw new Error("data.json does not match the expected TrialResult[] schema");
  }

  return parsed;
}

async function loadChartSpec(specFile: string): Promise<vl.TopLevelSpec> {
  const specPath = join(CHART_SPECS_DIR, specFile);
  const raw = await fs.readFile(specPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Invalid chart spec JSON: ${specPath}`);
  }

  return parsed as vl.TopLevelSpec;
}

function withDataValues(spec: vl.TopLevelSpec, values: ChartDatum[]): vl.TopLevelSpec {
  const specRecord = spec as Record<string, unknown>;

  return {
    ...specRecord,
    data: {
      values,
    },
  } as vl.TopLevelSpec;
}

export function computeAgentSummary(data: TrialResult[]): AgentSummary[] {
  const byAgent = new Map<string, TrialResult[]>();

  for (const result of data) {
    const existing = byAgent.get(result.agent);
    if (existing) {
      existing.push(result);
      continue;
    }

    byAgent.set(result.agent, [result]);
  }

  return [...byAgent.entries()]
    .sort(([leftAgent], [rightAgent]) => leftAgent.localeCompare(rightAgent))
    .map(([agent, trials]) => {
      const tasks = trials.length;
      const passes = trials.reduce((count, trial) => count + (trial.passed ? 1 : 0), 0);
      const totalInputTokens = trials.reduce(
        (sum, trial) => sum + trial.n_input_tokens,
        0,
      );
      const totalOutputTokens = trials.reduce(
        (sum, trial) => sum + trial.n_output_tokens,
        0,
      );
      const totalTokens = trials.reduce((sum, trial) => sum + trial.total_tokens, 0);
      const totalCostUsd = trials.reduce((sum, trial) => sum + trial.cost_usd, 0);
      const totalDurationSec = trials.reduce((sum, trial) => sum + trial.duration_sec, 0);

      const passRatePct = tasks === 0 ? 0 : (passes / tasks) * 100;
      const avgCostUsd = tasks === 0 ? 0 : totalCostUsd / tasks;
      const avgInputTokens = tasks === 0 ? 0 : totalInputTokens / tasks;
      const avgOutputTokens = tasks === 0 ? 0 : totalOutputTokens / tasks;
      const avgTokens = tasks === 0 ? 0 : totalTokens / tasks;
      const avgDurationSec = tasks === 0 ? 0 : totalDurationSec / tasks;
      const medianDurationSec = median(trials.map((trial) => trial.duration_sec));
      const tokensPerDollar = totalCostUsd > 0 ? totalTokens / totalCostUsd : 0;
      const passesPerDollar = totalCostUsd > 0 ? passes / totalCostUsd : 0;
      const tokensPerSecond = totalDurationSec > 0 ? totalTokens / totalDurationSec : 0;

      return {
        agent,
        tasks,
        passes,
        passRatePct,
        totalCostUsd,
        avgCostUsd,
        totalInputTokens,
        avgInputTokens,
        totalOutputTokens,
        avgOutputTokens,
        totalTokens,
        avgTokens,
        totalDurationSec,
        avgDurationSec,
        medianDurationSec,
        tokensPerDollar,
        passesPerDollar,
        tokensPerSecond,
      };
    });
}

export function generateSummaryTable(summaries: AgentSummary[]): string {
  const header =
    "| Agent | Tasks | Pass Rate | Avg Cost (USD) | Avg Tokens | Avg Duration (s) |";
  const separator = "| --- | ---: | ---: | ---: | ---: | ---: |";
  const rows = summaries.map(
    (summary) =>
      `| ${summary.agent} | ${summary.tasks} | ${summary.passRatePct.toFixed(1)}% | $${summary.avgCostUsd.toFixed(4)} | ${formatInteger(summary.avgTokens)} | ${summary.avgDurationSec.toFixed(1)} |`,
  );

  return [header, separator, ...rows].join("\n");
}

export function generatePerTaskTable(data: TrialResult[]): string {
  const agents = [...new Set(data.map((result) => result.agent))].sort((left, right) =>
    left.localeCompare(right),
  );
  const tasks = [...new Set(data.map((result) => result.task_id))].sort((left, right) =>
    left.localeCompare(right),
  );

  const taskToAgentOutcome = new Map<string, Map<string, boolean>>();

  for (const result of data) {
    const row = taskToAgentOutcome.get(result.task_id) ?? new Map<string, boolean>();
    row.set(result.agent, result.passed);
    taskToAgentOutcome.set(result.task_id, row);
  }

  const header = `| Task ID | ${agents.join(" | ")} |`;
  const separator = `| --- | ${agents.map(() => "---").join(" | ")} |`;

  const rows = tasks.map((taskId) => {
    const outcomes = taskToAgentOutcome.get(taskId);
    const cells = agents.map((agent) => {
      const outcome = outcomes?.get(agent);
      if (outcome === undefined) {
        return "N/A";
      }

      return outcome ? "Pass" : "Fail";
    });

    return `| ${taskId} | ${cells.join(" | ")} |`;
  });

  return [header, separator, ...rows].join("\n");
}

export function generateEfficiencyTable(summaries: AgentSummary[]): string {
  const header = "| Agent | Tokens / Dollar | Passes / Dollar | Tokens / Second |";
  const separator = "| --- | ---: | ---: | ---: |";
  const rows = summaries.map(
    (summary) =>
      `| ${summary.agent} | ${summary.tokensPerDollar.toFixed(2)} | ${summary.passesPerDollar.toFixed(2)} | ${summary.tokensPerSecond.toFixed(2)} |`,
  );

  return [header, separator, ...rows].join("\n");
}

export function assembleReportMarkdown(
  data: TrialResult[],
  summaries: AgentSummary[],
): string {
  return [
    "# Benchmark Comparison Report",
    "",
    "## Summary Table",
    generateSummaryTable(summaries),
    "",
    "## Pass Rate by Agent",
    "![Pass Rate by Agent](pass_rate.svg)",
    "",
    "## Token Usage",
    "![Token Usage](token_usage.svg)",
    "",
    "## Cost Comparison",
    "![Cost Comparison](cost_comparison.svg)",
    "",
    "## Duration Distribution",
    "![Duration Distribution](duration_comparison.svg)",
    "",
    "## Efficiency Metrics",
    generateEfficiencyTable(summaries),
    "",
    "## Per-Task Comparison",
    generatePerTaskTable(data),
    "",
  ].join("\n");
}

export function renderChart(vlSpec: vl.TopLevelSpec): Promise<string> {
  const vegaSpec = vl.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(vegaSpec), { renderer: "none" });
  return view.toSVG();
}

export async function generateReportWithRenderer(
  outputDir: string,
  chartRenderer: ChartRenderer,
): Promise<void> {
  const resolvedOutputDir = resolve(outputDir);
  const rawData = await fs.readFile(join(resolvedOutputDir, "data.json"), "utf8");
  const trialResults = parseTrialResults(rawData);
  const summaries = computeAgentSummary(trialResults);

  for (const definition of CHART_DEFINITIONS) {
    const baseSpec = await loadChartSpec(definition.specFile);
    const specWithValues = withDataValues(
      baseSpec,
      definition.valuesFromSummaries(summaries),
    );
    const svg = await chartRenderer(specWithValues);

    await fs.writeFile(join(resolvedOutputDir, definition.outputFile), svg, "utf8");
  }

  const reportMarkdown = assembleReportMarkdown(trialResults, summaries);
  await fs.writeFile(join(resolvedOutputDir, "report.md"), reportMarkdown, "utf8");
}

export async function generateReport(outputDir: string): Promise<void> {
  await generateReportWithRenderer(outputDir, renderChart);
}

if (import.meta.main) {
  const outputDir = process.argv[2];

  if (!outputDir) {
    console.error(
      "Usage: bun benchmarks/comparison/generate_report.ts <output_dir>",
    );
    process.exit(1);
  }

  generateReport(outputDir).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown error while generating report";
    console.error(`Failed to generate report: ${message}`);
    process.exit(1);
  });
}
