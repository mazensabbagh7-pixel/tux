import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  assembleReportMarkdown,
  computeAgentSummary,
  generateEfficiencyTable,
  generatePerTaskTable,
  generateReportWithRenderer,
  generateSummaryTable,
  type TrialResult,
} from "./generate_report";

const SAMPLE_DATA: TrialResult[] = [
  {
    agent: "mux",
    task_id: "task-a",
    passed: true,
    score: 1,
    n_input_tokens: 1000,
    n_output_tokens: 500,
    total_tokens: 1500,
    cost_usd: 0.1,
    duration_sec: 30,
  },
  {
    agent: "mux",
    task_id: "task-b",
    passed: false,
    score: 0,
    n_input_tokens: 800,
    n_output_tokens: 700,
    total_tokens: 1500,
    cost_usd: 0.2,
    duration_sec: 40,
  },
  {
    agent: "codex",
    task_id: "task-a",
    passed: true,
    score: 1,
    n_input_tokens: 900,
    n_output_tokens: 400,
    total_tokens: 1300,
    cost_usd: 0.08,
    duration_sec: 20,
  },
  {
    agent: "codex",
    task_id: "task-b",
    passed: true,
    score: 1,
    n_input_tokens: 1100,
    n_output_tokens: 600,
    total_tokens: 1700,
    cost_usd: 0.12,
    duration_sec: 30,
  },
];

describe("computeAgentSummary", () => {
  test("computes aggregate metrics per agent", () => {
    const summaries = computeAgentSummary(SAMPLE_DATA);

    expect(summaries).toHaveLength(2);

    const codexSummary = summaries.find((summary) => summary.agent === "codex");
    const muxSummary = summaries.find((summary) => summary.agent === "mux");

    expect(codexSummary).toBeDefined();
    expect(muxSummary).toBeDefined();

    expect(codexSummary?.tasks).toBe(2);
    expect(codexSummary?.passes).toBe(2);
    expect(codexSummary?.passRatePct).toBeCloseTo(100);
    expect(codexSummary?.totalCostUsd).toBeCloseTo(0.2);
    expect(codexSummary?.avgCostUsd).toBeCloseTo(0.1);
    expect(codexSummary?.totalTokens).toBe(3000);
    expect(codexSummary?.avgTokens).toBeCloseTo(1500);
    expect(codexSummary?.avgDurationSec).toBeCloseTo(25);
    expect(codexSummary?.medianDurationSec).toBeCloseTo(25);

    expect(muxSummary?.tasks).toBe(2);
    expect(muxSummary?.passes).toBe(1);
    expect(muxSummary?.passRatePct).toBeCloseTo(50);
    expect(muxSummary?.totalCostUsd).toBeCloseTo(0.3);
    expect(muxSummary?.avgCostUsd).toBeCloseTo(0.15);
    expect(muxSummary?.totalTokens).toBe(3000);
    expect(muxSummary?.avgTokens).toBeCloseTo(1500);
    expect(muxSummary?.avgDurationSec).toBeCloseTo(35);
    expect(muxSummary?.medianDurationSec).toBeCloseTo(35);
  });
});

describe("table generators", () => {
  test("generates summary table markdown", () => {
    const summaries = computeAgentSummary(SAMPLE_DATA);
    const table = generateSummaryTable(summaries);

    expect(table).toContain(
      "| Agent | Tasks | Pass Rate | Avg Cost (USD) | Avg Tokens | Avg Duration (s) |",
    );
    expect(table).toContain("| codex | 2 | 100.0% | $0.1000 | 1,500 | 25.0 |");
    expect(table).toContain("| mux | 2 | 50.0% | $0.1500 | 1,500 | 35.0 |");
  });

  test("generates per-task comparison matrix", () => {
    const table = generatePerTaskTable(SAMPLE_DATA);

    expect(table).toContain("| Task ID | codex | mux |");
    expect(table).toContain("| task-a | Pass | Pass |");
    expect(table).toContain("| task-b | Pass | Fail |");
  });

  test("generates efficiency metrics table", () => {
    const summaries = computeAgentSummary(SAMPLE_DATA);
    const table = generateEfficiencyTable(summaries);

    expect(table).toContain(
      "| Agent | Tokens / Dollar | Passes / Dollar | Tokens / Second |",
    );
    expect(table).toContain("| codex | 15000.00 | 10.00 | 60.00 |");
    expect(table).toContain("| mux | 10000.00 | 3.33 | 42.86 |");
  });
});

describe("report assembly", () => {
  test("assembles markdown report with all required sections", () => {
    const summaries = computeAgentSummary(SAMPLE_DATA);
    const report = assembleReportMarkdown(SAMPLE_DATA, summaries);

    expect(report).toContain("## Summary Table");
    expect(report).toContain("## Pass Rate by Agent");
    expect(report).toContain("## Token Usage");
    expect(report).toContain("## Cost Comparison");
    expect(report).toContain("## Duration Distribution");
    expect(report).toContain("## Efficiency Metrics");
    expect(report).toContain("## Per-Task Comparison");
  });

  test("writes report and svg files using a mocked chart renderer", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "benchmark-report-"));

    try {
      writeFileSync(
        join(outputDir, "data.json"),
        JSON.stringify(SAMPLE_DATA, null, 2),
        "utf8",
      );

      let renderCalls = 0;
      const mockSvg = "<svg><text>mock chart</text></svg>";

      await generateReportWithRenderer(outputDir, async () => {
        renderCalls += 1;
        return mockSvg;
      });

      expect(renderCalls).toBe(4);

      expect(readFileSync(join(outputDir, "pass_rate.svg"), "utf8")).toBe(mockSvg);
      expect(readFileSync(join(outputDir, "token_usage.svg"), "utf8")).toBe(mockSvg);
      expect(readFileSync(join(outputDir, "cost_comparison.svg"), "utf8")).toBe(mockSvg);
      expect(readFileSync(join(outputDir, "duration_comparison.svg"), "utf8")).toBe(
        mockSvg,
      );

      const report = readFileSync(join(outputDir, "report.md"), "utf8");
      expect(report).toContain("# Benchmark Comparison Report");
      expect(report).toContain("![Pass Rate by Agent](pass_rate.svg)");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
