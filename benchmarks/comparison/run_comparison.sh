#!/usr/bin/env bash
set -euo pipefail

if (( BASH_VERSINFO[0] < 4 )); then
  echo "Error: run_comparison.sh requires bash 4+" >&2
  exit 1
fi

DATASET="${DATASET:-terminal-bench@2.0}"
CONCURRENCY="${CONCURRENCY:-48}"
RUN_ENV="${ENV:-daytona}"
TASK_NAMES="${TASK_NAMES:-}"
MUX_MODEL="${MUX_MODEL:-anthropic/claude-sonnet-4-5}"
CLAUDE_MODEL="${CLAUDE_MODEL:-anthropic/claude-sonnet-4-5}"
CODEX_MODEL="${CODEX_MODEL:-openai/gpt-5.2-codex}"
DRY_RUN="${DRY_RUN:-}"
RUNS="${RUNS:-}"
AGENTS="${AGENTS:-mux claude-code codex}"

# Harbor requires Python ≥3.12; ensure uv uses it
export UV_PYTHON="${UV_PYTHON:-3.12}"

# Host-side MUX_PROJECT_PATH values point to paths that do not exist inside Harbor
# Docker containers. Unset it so mux-run.sh resolves from in-container fallback candidates.
unset MUX_PROJECT_PATH

# Bridge ANTHROPIC_AUTH_TOKEN → ANTHROPIC_API_KEY if the standard key isn't set.
# Claude Code CLI and Harbor built-in agents expect ANTHROPIC_API_KEY.
if [[ -z "${ANTHROPIC_API_KEY:-}" && -n "${ANTHROPIC_AUTH_TOKEN:-}" ]]; then
  export ANTHROPIC_API_KEY="${ANTHROPIC_AUTH_TOKEN}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="${SCRIPT_DIR}/reports"
TIMESTAMP="$(date +"%Y-%m-%d__%H-%M-%S")"
OUTPUT_DIR="${REPORTS_DIR}/${TIMESTAMP}"

log() {
  printf '[comparison] %s\n' "$1"
}

print_command() {
  printf '[comparison] '
  printf '%q ' "$@"
  printf '\n'
}

declare -A AGENT_TARGETS=(
  [mux]="benchmarks.terminal_bench.mux_agent:MuxAgent"
  [claude-code]="claude-code"
  [codex]="codex"
)

declare -A AGENT_MODELS=(
  [mux]="${MUX_MODEL}"
  [claude-code]="${CLAUDE_MODEL}"
  [codex]="${CODEX_MODEL}"
)

declare -A AGENT_EXTRAS=(
  [mux]="--agent-kwarg timeout=1800"
  [claude-code]=""
  [codex]=""
)

read -r -a selected_tasks <<<"${TASK_NAMES}"

declare -a RUN_AGENTS=()
declare -a RUN_MODELS=()
declare -a RUN_SLUGS=()

model_slug_from_id() {
  local model_id="$1"
  local model_slug="${model_id##*/}"

  if [[ -z "${model_slug}" ]]; then
    echo "Error: model '${model_id}' must end with a non-empty slug" >&2
    exit 1
  fi

  printf '%s\n' "${model_slug}"
}

add_run() {
  local agent="$1"
  local model="$2"
  local model_slug

  if [[ -z "${AGENT_TARGETS[$agent]+x}" ]]; then
    echo "Error: unknown agent '${agent}'. Valid options: mux, claude-code, codex" >&2
    exit 1
  fi

  if [[ -z "${model}" ]]; then
    echo "Error: agent '${agent}' must have a non-empty model" >&2
    exit 1
  fi

  model_slug="$(model_slug_from_id "${model}")"

  # Normalize RUNS and legacy AGENTS into one run list so the same agent can be
  # benchmarked against multiple models without output directory collisions.
  RUN_AGENTS+=("${agent}")
  RUN_MODELS+=("${model}")
  RUN_SLUGS+=("${model_slug}")
}

strip_claude_model_provider() {
  local model="$1"

  # Claude Code CLI rejects provider prefixes even though timing.json should keep
  # the full provider-prefixed model ID for downstream reporting.
  model="${model#anthropic/}"
  model="${model#openai/}"
  printf '%s\n' "${model}"
}

if [[ -n "${RUNS}" ]]; then
  read -r -a selected_runs <<<"${RUNS}"

  if [[ ${#selected_runs[@]} -eq 0 ]]; then
    echo "Error: RUNS must include at least one agent:model entry" >&2
    exit 1
  fi

  for run_spec in "${selected_runs[@]}"; do
    if [[ "${run_spec}" != *:* ]]; then
      echo "Error: RUNS entries must use agent:model format; got '${run_spec}'" >&2
      exit 1
    fi

    agent="${run_spec%%:*}"
    model="${run_spec#*:}"

    if [[ -z "${agent}" || -z "${model}" ]]; then
      echo "Error: RUNS entries must use agent:model format with non-empty values; got '${run_spec}'" >&2
      exit 1
    fi

    add_run "${agent}" "${model}"
  done
else
  read -r -a selected_agents <<<"${AGENTS}"

  if [[ ${#selected_agents[@]} -eq 0 ]]; then
    echo "Error: AGENTS must include at least one agent" >&2
    exit 1
  fi

  for agent in "${selected_agents[@]}"; do
    add_run "${agent}" "${AGENT_MODELS[$agent]-}"
  done
fi

declare -A seen_run_dirs=()
for i in "${!RUN_AGENTS[@]}"; do
  run_dir_name="${RUN_AGENTS[$i]}__${RUN_SLUGS[$i]}"
  run_label="${RUN_AGENTS[$i]}:${RUN_MODELS[$i]}"

  if [[ -n "${seen_run_dirs[$run_dir_name]+x}" ]]; then
    echo "Error: duplicate run output directory '${run_dir_name}' for '${seen_run_dirs[$run_dir_name]}' and '${run_label}'" >&2
    exit 1
  fi

  seen_run_dirs["${run_dir_name}"]="${run_label}"
done

mkdir -p "${OUTPUT_DIR}"
log "Output directory: ${OUTPUT_DIR}"

for i in "${!RUN_AGENTS[@]}"; do
  agent="${RUN_AGENTS[$i]}"
  original_model="${RUN_MODELS[$i]}"
  model_slug="${RUN_SLUGS[$i]}"

  agent_dir="${OUTPUT_DIR}/${agent}__${model_slug}"
  harbor_log="${agent_dir}/harbor.log"
  timing_json="${agent_dir}/timing.json"
  mkdir -p "${agent_dir}"

  model="${original_model}"
  if [[ "${agent}" == "claude-code" ]]; then
    model="$(strip_claude_model_provider "${model}")"
  fi

  command=(
    uvx harbor run
    --dataset "${DATASET}"
    --n-concurrent "${CONCURRENCY}"
    --env "${RUN_ENV}"
    -m "${model}"
    --jobs-dir "${agent_dir}"
  )

  target="${AGENT_TARGETS[$agent]}"
  if [[ "${target}" == *:* ]]; then
    command+=(--agent-import-path "${target}")
  else
    command+=(--agent "${target}")
  fi

  extra="${AGENT_EXTRAS[$agent]}"
  if [[ -n "${extra}" ]]; then
    # shellcheck disable=SC2206
    extra_args=(${extra})
    command+=("${extra_args[@]}")
  fi

  for task_name in "${selected_tasks[@]}"; do
    if [[ -n "${task_name}" ]]; then
      command+=(--task-name "${task_name}")
    fi
  done

  log "Running agent: ${agent} (${original_model})"
  start_epoch="$(date +%s)"
  start_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [[ "${DRY_RUN}" == "1" ]]; then
    print_command "${command[@]}"
  else
    "${command[@]}" 2>&1 | tee "${harbor_log}"
  fi

  end_epoch="$(date +%s)"
  end_iso="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  duration_sec=$((end_epoch - start_epoch))

  dry_run_flag=false
  if [[ "${DRY_RUN}" == "1" ]]; then
    dry_run_flag=true
  fi

  cat >"${timing_json}" <<TIMING_JSON
{
  "agent": "${agent}",
  "model": "${original_model}",
  "started_at": "${start_iso}",
  "finished_at": "${end_iso}",
  "duration_sec": ${duration_sec},
  "dry_run": ${dry_run_flag}
}
TIMING_JSON
done

collector_command=(python3 "${SCRIPT_DIR}/collect_results.py" "${OUTPUT_DIR}")
report_command=(bun "${SCRIPT_DIR}/generate_report.ts" "${OUTPUT_DIR}")

if [[ "${DRY_RUN}" == "1" ]]; then
  log "Dry run enabled; skipping collector/report execution."
  print_command "${collector_command[@]}"
  print_command "${report_command[@]}"
else
  "${collector_command[@]}"
  "${report_command[@]}"
fi

log "Run complete."
log "Results directory: ${OUTPUT_DIR}"
log "Report markdown: ${OUTPUT_DIR}/report.md"
