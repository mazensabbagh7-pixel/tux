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
    model: "anthropic/claude-sonnet-4-5",
    task_id: "task-a",
    passed: true,
    score: 1,
    n_input_tokens: 1000,
    n_output_tokens: 500,
    total_tokens: 1500,
    n_cached_tokens: 200,
    n_cache_create_tokens: 100,
    n_reasoning_tokens: 50,
    cost_usd: 0.1,
    duration_sec: 30,
  },
  {
    agent: "mux",
    model: "anthropic/claude-sonnet-4-5",
    task_id: "task-b",
    passed: false,
    score: 0,
    n_input_tokens: 800,
    n_output_tokens: 700,
    total_tokens: 1500,
    n_cached_tokens: 150,
    n_cache_create_tokens: 80,
    n_reasoning_tokens: 30,
    cost_usd: 0.2,
    duration_sec: 40,
  },
  {
    agent: "codex",
    model: "openai/gpt-5.2-codex",
    task_id: "task-a",
    passed: true,
    score: 1,
    n_input_tokens: 900,
    n_output_tokens: 400,
    total_tokens: 1300,
    n_cached_tokens: null,
    n_cache_create_tokens: null,
    n_reasoning_tokens: null,
    cost_usd: 0.08,
    duration_sec: 20,
  },
  {
    agent: "codex",
    model: "openai/gpt-5.2-codex",
    task_id: "task-b",
    passed: true,
    score: 1,
    n_input_tokens: 1100,
    n_output_tokens: 600,
    total_tokens: 1700,
    n_cached_tokens: null,
    n_cache_create_tokens: null,
    n_reasoning_tokens: null,
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

    expect(codexSummary?.model).toBe("openai/gpt-5.2-codex");
    expect(muxSummary?.model).toBe("anthropic/claude-sonnet-4-5");
    expect(codexSummary?.tasks).toBe(2);
    expect(codexSummary?.passes).toBe(2);
    expect(codexSummary?.passRatePct).toBeCloseTo(100);
    expect(codexSummary?.totalCostUsd).toBeCloseTo(0.2);
    expect(codexSummary?.avgCostUsd).toBeCloseTo(0.1);
    expect(codexSummary?.totalTokens).toBe(3000);
    expect(codexSummary?.avgTokens).toBeCloseTo(1500);
    expect(codexSummary?.totalCachedTokens).toBe(0);
    expect(codexSummary?.totalCacheCreateTokens).toBe(0);
    expect(codexSummary?.totalReasoningTokens).toBe(0);
    expect(codexSummary?.avgDurationSec).toBeCloseTo(25);
    expect(codexSummary?.medianDurationSec).toBeCloseTo(25);

    expect(muxSummary?.tasks).toBe(2);
    expect(muxSummary?.passes).toBe(1);
    expect(muxSummary?.passRatePct).toBeCloseTo(50);
    expect(muxSummary?.totalCostUsd).toBeCloseTo(0.3);
    expect(muxSummary?.avgCostUsd).toBeCloseTo(0.15);
    expect(muxSummary?.totalTokens).toBe(3000);
    expect(muxSummary?.avgTokens).toBeCloseTo(1500);
    expect(muxSummary?.totalCachedTokens).toBe(350);
    expect(muxSummary?.avgCachedTokens).toBeCloseTo(175);
    expect(muxSummary?.totalCacheCreateTokens).toBe(180);
    expect(muxSummary?.avgCacheCreateTokens).toBeCloseTo(90);
    expect(muxSummary?.totalReasoningTokens).toBe(80);
    expect(muxSummary?.avgReasoningTokens).toBeCloseTo(40);
    expect(muxSummary?.avgDurationSec).toBeCloseTo(35);
    expect(muxSummary?.medianDurationSec).toBeCloseTo(35);
  });
});

describe("table generators", () => {
  test("generates summary table markdown", () => {
    const summaries = computeAgentSummary(SAMPLE_DATA);
    const table = generateSummaryTable(summaries);

    expect(table).toContain(
      "| Agent | Model | Tasks | Pass Rate | Avg Cost (USD) | Avg Tokens | Avg Cached | Avg Cache Create | Avg Reasoning | Avg Duration (s) |"
    );
    expect(table).toContain(
      "| codex | openai/gpt-5.2-codex | 2 | 100.0% | $0.1000 | 1,500 | 0 | 0 | 0 | 25.0 |"
    );
    expect(table).toContain(
      "| mux | anthropic/claude-sonnet-4-5 | 2 | 50.0% | $0.1500 | 1,500 | 175 | 90 | 40 | 35.0 |"
    );
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

    expect(table).toContain("| Agent | Tokens / Dollar | Passes / Dollar | Tokens / Second |");
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
      writeFileSync(join(outputDir, "data.json"), JSON.stringify(SAMPLE_DATA, null, 2), "utf8");

      let renderCalls = 0;
      let tokenUsageValues: unknown[] | undefined;
      const mockSvg = "<svg><text>mock chart</text></svg>";

      await generateReportWithRenderer(outputDir, async (spec) => {
        renderCalls += 1;
        if (spec.data && "values" in spec.data && Array.isArray(spec.data.values)) {
          const values = spec.data.values;
          if (
            values.some(
              (value) =>
                value !== null &&
                typeof value === "object" &&
                "token_type" in value &&
                value.token_type === "reasoning"
            )
          ) {
            tokenUsageValues = values;
          }
        }

        return mockSvg;
      });

      expect(renderCalls).toBe(4);
      expect(tokenUsageValues).toEqual([
        { agent: "codex", token_type: "input", tokens: 2000 },
        { agent: "codex", token_type: "output", tokens: 1000 },
        { agent: "codex", token_type: "cached", tokens: 0 },
        { agent: "codex", token_type: "cache_create", tokens: 0 },
        { agent: "codex", token_type: "reasoning", tokens: 0 },
        { agent: "mux", token_type: "input", tokens: 1800 },
        { agent: "mux", token_type: "output", tokens: 1200 },
        { agent: "mux", token_type: "cached", tokens: 350 },
        { agent: "mux", token_type: "cache_create", tokens: 180 },
        { agent: "mux", token_type: "reasoning", tokens: 80 },
      ]);

      expect(readFileSync(join(outputDir, "pass_rate.svg"), "utf8")).toBe(mockSvg);
      expect(readFileSync(join(outputDir, "token_usage.svg"), "utf8")).toBe(mockSvg);
      expect(readFileSync(join(outputDir, "cost_comparison.svg"), "utf8")).toBe(mockSvg);
      expect(readFileSync(join(outputDir, "duration_comparison.svg"), "utf8")).toBe(mockSvg);

      const report = readFileSync(join(outputDir, "report.md"), "utf8");
      expect(report).toContain("# Benchmark Comparison Report");
      expect(report).toContain("![Pass Rate by Agent](pass_rate.svg)");
      expect(report).toContain("## Token Usage");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
