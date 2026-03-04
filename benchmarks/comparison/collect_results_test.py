from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from benchmarks.comparison.collect_results import (
    collect_results,
    extract_duration_sec,
    extract_task_id,
    main,
    parse_trial_result,
    write_outputs,
)


def _write_trial(base: Path, agent: str, trial: str, payload: dict) -> Path:
    """Write a trial under agent/<job_timestamp>/<trial>/result.json (Harbor layout)."""
    trial_dir = base / agent / "2026-01-01__00-00-00" / trial
    trial_dir.mkdir(parents=True, exist_ok=True)
    (trial_dir / "result.json").write_text(json.dumps(payload), encoding="utf-8")
    return trial_dir


@pytest.mark.parametrize(
    ("agent", "trial", "payload", "expected"),
    [
        (
            "mux",
            "chess-best-move__abc",
            {
                "verifier_result": {"rewards": {"reward": 1.0}},
                "agent_execution": {
                    "started_at": "2026-01-01T00:00:00Z",
                    "finished_at": "2026-01-01T00:00:45.300000Z",
                    "n_input_tokens": 15420,
                    "n_output_tokens": 3201,
                    "cost_usd": 0.12,
                },
            },
            {
                "passed": True,
                "score": 1.0,
                "n_input_tokens": 15420,
                "n_output_tokens": 3201,
                "total_tokens": 18621,
                "cost_usd": 0.12,
                "duration_sec": 45.3,
            },
        ),
        (
            "claude-code",
            "json-parse__def",
            {
                "score": 0,
                "started_at": "2026-01-01T00:00:00+00:00",
                "finished_at": "2026-01-01T00:00:05+00:00",
                "n_input_tokens": 120,
                "n_output_tokens": 80,
                "cost_usd": "0.04",
            },
            {
                "passed": False,
                "score": 0.0,
                "n_input_tokens": 120,
                "n_output_tokens": 80,
                "total_tokens": 200,
                "cost_usd": 0.04,
                "duration_sec": 5.0,
            },
        ),
        (
            "codex",
            "sort-list__ghi",
            {
                "verifier_result": {"passed": False},
                "agent_result": {
                    "n_input_tokens": "10",
                    "n_output_tokens": "7",
                    "cost_usd": "0.003",
                },
            },
            {
                "passed": False,
                "score": None,
                "n_input_tokens": 10,
                "n_output_tokens": 7,
                "total_tokens": 17,
                "cost_usd": 0.003,
                "duration_sec": None,
            },
        ),
    ],
)
def test_parse_trial_result_formats(
    tmp_path: Path,
    agent: str,
    trial: str,
    payload: dict,
    expected: dict,
) -> None:
    row = parse_trial_result(agent, _write_trial(tmp_path, agent, trial, payload))
    assert row is not None
    assert row["task_id"] == trial.split("__", 1)[0]
    for key, value in expected.items():
        if isinstance(value, float):
            assert row[key] == pytest.approx(value)
        else:
            assert row[key] == value


def test_duration_and_task_id_helpers() -> None:
    assert (
        extract_duration_sec(
            {
                "agent_execution": {
                    "started_at": "2026-01-01T00:00:00Z",
                    "finished_at": "2026-01-01T00:01:30Z",
                }
            }
        )
        == pytest.approx(90.0)
    )
    assert extract_duration_sec({"started_at": "bad", "finished_at": "worse"}) is None
    assert extract_task_id("name__HASH") == "name"
    assert extract_task_id("name__with__extra") == "name__with"
    assert extract_task_id("plain") == "plain"


def test_parse_trial_result_handles_missing_or_malformed_fields(tmp_path: Path) -> None:
    row = parse_trial_result(
        "mux",
        _write_trial(
            tmp_path,
            "mux",
            "missing__xyz",
            {
                "verifier_result": {"rewards": {"reward": "unknown"}},
                "agent_execution": {
                    "started_at": "bad-timestamp",
                    "finished_at": "also-bad",
                },
            },
        ),
    )
    assert row is not None
    assert row["passed"] is None
    assert row["score"] is None
    assert row["n_input_tokens"] is None
    assert row["n_output_tokens"] is None
    assert row["total_tokens"] is None
    assert row["cost_usd"] is None
    assert row["duration_sec"] is None


def test_write_outputs_generates_expected_json_and_csv(tmp_path: Path) -> None:
    rows = [
        {
            "agent": "mux",
            "task_id": "task-1",
            "passed": True,
            "score": 1.0,
            "n_input_tokens": 5,
            "n_output_tokens": 7,
            "total_tokens": 12,
            "cost_usd": 0.01,
            "duration_sec": 2.5,
        }
    ]
    json_path, csv_path = write_outputs(tmp_path, rows)
    assert json.loads(json_path.read_text(encoding="utf-8")) == rows
    with csv_path.open(newline="", encoding="utf-8") as handle:
        parsed = list(csv.DictReader(handle))
    assert parsed == [
        {
            "agent": "mux",
            "task_id": "task-1",
            "passed": "True",
            "score": "1.0",
            "n_input_tokens": "5",
            "n_output_tokens": "7",
            "total_tokens": "12",
            "cost_usd": "0.01",
            "duration_sec": "2.5",
        }
    ]


def test_main_flow_collects_results_and_handles_empty_dirs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _write_trial(
        tmp_path,
        "mux",
        "task-a__111",
        {"passed": True, "n_input_tokens": 3, "n_output_tokens": 2, "cost_usd": 0.01},
    )
    _write_trial(
        tmp_path,
        "claude-code",
        "task-b__222",
        {"score": 0, "n_input_tokens": 4, "n_output_tokens": 5, "cost_usd": 0.02},
    )
    _write_trial(
        tmp_path,
        "codex",
        "task-c__333",
        {
            "verifier_result": {"passed": True},
            "agent_result": {"n_input_tokens": 1, "n_output_tokens": 1, "cost_usd": 0.005},
        },
    )
    (tmp_path / "empty-agent").mkdir(parents=True, exist_ok=True)

    assert main([str(tmp_path)]) == 0
    assert len(collect_results(tmp_path)) == 3
    assert len(json.loads((tmp_path / "data.json").read_text(encoding="utf-8"))) == 3
    assert "Collected 3 trial(s) across 3 agent(s)." in capsys.readouterr().out


def test_main_handles_empty_output_directory(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([str(tmp_path)]) == 0
    assert json.loads((tmp_path / "data.json").read_text(encoding="utf-8")) == []
    assert "Collected 0 trial(s) across 0 agent(s)." in capsys.readouterr().out


def _write_trial_harbor_layout(
    base: Path, agent: str, job_ts: str, trial: str, payload: dict
) -> Path:
    """Write a trial using the real Harbor directory layout:
    <agent>/<job_timestamp>/<trial_name>/result.json"""
    trial_dir = base / agent / job_ts / trial
    trial_dir.mkdir(parents=True, exist_ok=True)
    (trial_dir / "result.json").write_text(json.dumps(payload), encoding="utf-8")
    return trial_dir


def test_collect_results_with_real_harbor_layout(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """Verify the collector finds trials in Harbor's actual layout:
    <agent>/<job_timestamp>/<trial_name>/result.json (no jobs/ prefix)."""
    _write_trial_harbor_layout(
        tmp_path,
        "mux",
        "2026-03-04__02-51-00",
        "chess-best-move__Z5rUCVE",
        {
            "verifier_result": {"rewards": {"reward": 0.0}},
            "agent_execution": {
                "started_at": "2026-03-04T02:52:18.984626Z",
                "finished_at": "2026-03-04T02:52:19.269006Z",
            },
            "agent_result": {
                "n_input_tokens": None,
                "n_output_tokens": None,
                "cost_usd": None,
            },
        },
    )
    # Also write harbor.log and timing.json siblings (should be ignored)
    (tmp_path / "mux" / "harbor.log").write_text("log", encoding="utf-8")
    (tmp_path / "mux" / "timing.json").write_text("{}", encoding="utf-8")

    assert main([str(tmp_path)]) == 0
    rows = json.loads((tmp_path / "data.json").read_text(encoding="utf-8"))
    assert len(rows) == 1
    assert rows[0]["agent"] == "mux"
    assert rows[0]["task_id"] == "chess-best-move"
    assert rows[0]["passed"] is False
    assert "Collected 1 trial(s)" in capsys.readouterr().out
