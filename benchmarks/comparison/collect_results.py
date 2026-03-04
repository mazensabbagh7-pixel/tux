"""Aggregate Harbor results from multiple agents into a unified dataset."""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

RESULT_COLUMNS = [
    "agent",
    "model",
    "task_id",
    "passed",
    "score",
    "n_input_tokens",
    "n_output_tokens",
    "total_tokens",
    "cost_usd",
    "duration_sec",
]


def extract_task_id(folder_name: str) -> str:
    """Strip Harbor hash suffix (`__<hash>`) from trial folder names."""
    return folder_name.rsplit("__", 1)[0] if "__" in folder_name else folder_name


def _as_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    try:
        return int(value)
    except (TypeError, ValueError):
        as_float = _as_float(value)
        return int(as_float) if as_float is not None else None


def _as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    numeric = _as_float(value)
    if numeric is not None:
        return numeric > 0
    return None


def get_passed(data: dict[str, Any]) -> bool | None:
    """Inline pass/fail extraction from existing Terminal-Bench utility logic."""
    if "passed" in data and data["passed"] is not None:
        parsed = _as_bool(data["passed"])
        if parsed is not None:
            return parsed

    if "score" in data:
        score = _as_float(data.get("score"))
        if score is not None:
            return score > 0

    verifier_result = data.get("verifier_result")
    if isinstance(verifier_result, dict):
        if "passed" in verifier_result:
            parsed = _as_bool(verifier_result.get("passed"))
            if parsed is not None:
                return parsed
        rewards = verifier_result.get("rewards")
        if isinstance(rewards, dict):
            reward = _as_float(rewards.get("reward"))
            if reward is not None:
                return reward > 0
    return None


def _pick(data: dict[str, Any], key: str) -> Any:
    for source in (data, data.get("agent_result"), data.get("agent_execution")):
        if isinstance(source, dict) and source.get(key) is not None:
            return source[key]
    return None


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def extract_duration_sec(data: dict[str, Any]) -> float | None:
    execution = data.get("agent_execution")
    started_at = execution.get("started_at") if isinstance(execution, dict) else None
    finished_at = execution.get("finished_at") if isinstance(execution, dict) else None

    start_dt = _parse_iso(started_at if started_at is not None else data.get("started_at"))
    finish_dt = _parse_iso(
        finished_at if finished_at is not None else data.get("finished_at")
    )
    if start_dt is None or finish_dt is None:
        return None

    seconds = (finish_dt - start_dt).total_seconds()
    return seconds if seconds >= 0 else None


def extract_score(data: dict[str, Any]) -> float | None:
    verifier_result = data.get("verifier_result")
    if isinstance(verifier_result, dict):
        rewards = verifier_result.get("rewards")
        if isinstance(rewards, dict):
            reward = _as_float(rewards.get("reward"))
            if reward is not None:
                return reward
    return _as_float(data.get("score"))


def parse_trial_result(
    agent: str, trial_dir: Path, model: str | None = None
) -> dict[str, Any] | None:
    result_path = trial_dir / "result.json"
    if not result_path.is_file():
        return None

    try:
        data = json.loads(result_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Warning: failed to read {result_path}: {exc}", file=sys.stderr)
        return None
    if not isinstance(data, dict):
        print(f"Warning: expected JSON object in {result_path}", file=sys.stderr)
        return None

    n_input_tokens = _as_int(_pick(data, "n_input_tokens"))
    n_output_tokens = _as_int(_pick(data, "n_output_tokens"))
    total_tokens = (
        n_input_tokens + n_output_tokens
        if n_input_tokens is not None and n_output_tokens is not None
        else None
    )

    return {
        "agent": agent,
        "model": model,
        "task_id": extract_task_id(trial_dir.name),
        "passed": get_passed(data),
        "score": extract_score(data),
        "n_input_tokens": n_input_tokens,
        "n_output_tokens": n_output_tokens,
        "total_tokens": total_tokens,
        "cost_usd": _as_float(_pick(data, "cost_usd")),
        "duration_sec": extract_duration_sec(data),
    }


def read_agent_model(agent_dir: Path) -> str | None:
    timing_path = agent_dir / "timing.json"
    if not timing_path.is_file():
        return None

    try:
        raw = json.loads(timing_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Warning: failed to read {timing_path}: {exc}", file=sys.stderr)
        return None

    if not isinstance(raw, dict):
        print(f"Warning: expected JSON object in {timing_path}", file=sys.stderr)
        return None

    model = raw.get("model")
    return model if isinstance(model, str) else None


def collect_agent_results(agent_dir: Path) -> list[dict[str, Any]]:
    """Scan an agent output directory for trial results.

    Harbor writes trials as:
        <agent_dir>/<job_timestamp>/<trial_name>/result.json

    Each job_timestamp directory is a separate Harbor run; within it
    each subdirectory is a trial (task).  We also support a legacy
    ``jobs/`` prefix for older layouts.
    """
    rows: list[dict[str, Any]] = []
    model = read_agent_model(agent_dir)

    # Candidate job root dirs: Harbor default (<agent_dir>/<timestamp>/)
    # or legacy (<agent_dir>/jobs/<timestamp>/).
    job_roots: list[Path] = []
    jobs_dir = agent_dir / "jobs"
    if jobs_dir.is_dir():
        job_roots.extend(
            d for d in sorted(jobs_dir.iterdir()) if d.is_dir()
        )
    # Also scan direct children that look like timestamped run dirs.
    for child in sorted(agent_dir.iterdir()):
        if child.is_dir() and child.name not in ("jobs",) and not child.name.startswith("."):
            # Skip files like harbor.log, timing.json via is_dir()
            job_roots.append(child)

    for job_dir in job_roots:
        for trial_dir in sorted(job_dir.iterdir()):
            if trial_dir.is_dir():
                row = parse_trial_result(agent_dir.name, trial_dir, model)
                if row is not None:
                    rows.append(row)
    return rows


def collect_results(output_dir: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for agent_dir in sorted(output_dir.iterdir()):
        if agent_dir.is_dir():
            rows.extend(collect_agent_results(agent_dir))
    return rows


def write_outputs(output_dir: Path, rows: list[dict[str, Any]]) -> tuple[Path, Path]:
    json_path = output_dir / "data.json"
    csv_path = output_dir / "data.csv"

    json_path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=RESULT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return json_path, csv_path


def print_summary(rows: list[dict[str, Any]]) -> None:
    agents = sorted({str(row["agent"]) for row in rows})
    print(f"Collected {len(rows)} trial(s) across {len(agents)} agent(s).")

    known = [row for row in rows if isinstance(row.get("passed"), bool)]
    if known:
        passed = sum(1 for row in known if row["passed"])
        print(f"Overall pass rate: {passed}/{len(known)} ({100.0 * passed / len(known):.1f}%)")
    else:
        print("Overall pass rate: n/a")

    for agent in agents:
        agent_rows = [row for row in rows if row["agent"] == agent]
        known_agent = [row for row in agent_rows if isinstance(row.get("passed"), bool)]
        models = sorted(
            {
                model
                for model in (row.get("model") for row in agent_rows)
                if isinstance(model, str)
            }
        )
        if known_agent:
            passed = sum(1 for row in known_agent if row["passed"])
            rate = f"{passed}/{len(known_agent)} ({100.0 * passed / len(known_agent):.1f}%)"
        else:
            rate = "n/a"

        if not models:
            model_display = "n/a"
        elif len(models) == 1:
            model_display = models[0]
        else:
            model_display = ", ".join(models)

        print(
            f"- {agent} (model: {model_display}): {len(agent_rows)} trial(s), pass rate {rate}"
        )


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print(
            "Usage: python3 benchmarks/comparison/collect_results.py <output_dir>",
            file=sys.stderr,
        )
        return 1

    output_dir = Path(args[0])
    if not output_dir.is_dir():
        print(f"Error: output directory does not exist: {output_dir}", file=sys.stderr)
        return 1

    rows = collect_results(output_dir)
    json_path, csv_path = write_outputs(output_dir, rows)

    print(f"Wrote {json_path}")
    print(f"Wrote {csv_path}")
    print_summary(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
