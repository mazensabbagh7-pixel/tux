# Benchmark Comparison Framework

This framework runs the same Terminal-Bench 2.0 / Harbor task set across Mux, Claude Code, and Codex CLI agents, then normalizes outputs into comparable metrics and a markdown report with SVG charts.

## Directory structure

```text
benchmarks/comparison/
├── README.md
├── run_comparison.sh
├── collect_results.py
├── generate_report.ts
├── chart_specs/
│   ├── cost_comparison.json
│   ├── duration_comparison.json
│   ├── pass_rate.json
│   └── token_usage.json
└── reports/
    ├── .gitignore
    └── .gitkeep
```

## Prerequisites

- Python 3 (`python3`)
- Bun (`bun`)
- Harbor available through `uvx harbor`
- Provider API keys for the models you run (Anthropic/OpenAI/etc.)
- `DAYTONA_API_KEY` when using `ENV=daytona`

## Quick start

```bash
# Quick test (1 task, local Docker)
TASK_NAMES="chess-best-move" ENV=docker CONCURRENCY=1 \
  bash benchmarks/comparison/run_comparison.sh

# Full suite on Daytona
DAYTONA_API_KEY=xxx ENV=daytona CONCURRENCY=48 \
  bash benchmarks/comparison/run_comparison.sh

# Custom models
MUX_MODEL=anthropic/claude-opus-4-5 \
  bash benchmarks/comparison/run_comparison.sh

# Dry run (print commands only)
DRY_RUN=1 bash benchmarks/comparison/run_comparison.sh

# Run only specific agents
AGENTS="mux claude-code" bash benchmarks/comparison/run_comparison.sh
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATASET` | `terminal-bench@2.0` | Harbor dataset name. |
| `CONCURRENCY` | `48` | Harbor worker concurrency. |
| `ENV` | `daytona` | Harbor runtime environment (`daytona`, `docker`, etc.). |
| `TASK_NAMES` | *(empty)* | Space-separated task list; empty runs all dataset tasks. |
| `MUX_MODEL` | `anthropic/claude-sonnet-4-5` | Model for the custom Mux agent import path. |
| `CLAUDE_MODEL` | `anthropic/claude-sonnet-4-5` | Model for `claude-code` Harbor agent. |
| `CODEX_MODEL` | `openai/gpt-5.2-codex` | Model for `codex` Harbor agent. |
| `DRY_RUN` | *(empty)* | Set to `1` to print commands without running Harbor/aggregation. |
| `AGENTS` | `mux claude-code codex` | Space-separated list of agents to run. |

## Output

Each execution writes to `benchmarks/comparison/reports/YYYY-MM-DD__HH-MM-SS/`.

- Per-agent artifacts in `<output_dir>/<agent>/` (including `harbor.log` and `timing.json`)
- Aggregated outputs in `<output_dir>/data.json` and `<output_dir>/data.csv`
- Final report in `<output_dir>/report.md`
- Generated charts: `pass_rate.svg`, `token_usage.svg`, `cost_comparison.svg`, `duration_comparison.svg`
