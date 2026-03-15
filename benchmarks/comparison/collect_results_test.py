from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

from benchmarks.comparison.collect_results import (
    RESULT_COLUMNS,
    collect_results,
    extract_duration_sec,
    extract_task_id,
    main,
    parse_agent_dir_name,
    parse_trial_result,
    write_outputs,
)


def _write_timing(base: Path, agent: str, model: str | None) -> Path:
    agent_dir = base / agent
    agent_dir.mkdir(parents=True, exist_ok=True)
    payload: dict[str, str] = {"agent": agent}
    if model is not None:
        payload["model"] = model
    timing_path = agent_dir / "timing.json"
    timing_path.write_text(json.dumps(payload), encoding="utf-8")
    return timing_path


def _write_trial(base: Path, agent: str, trial: str, payload: dict) -> Path:
    """Write a trial under agent/<job_timestamp>/<trial>/result.json (Harbor layout)."""
    trial_dir = base / agent / "2026-01-01__00-00-00" / trial
    trial_dir.mkdir(parents=True, exist_ok=True)
    (trial_dir / "result.json").write_text(json.dumps(payload), encoding="utf-8")
    return trial_dir


def _write_mux_token_file(trial_dir: Path, payload: dict) -> Path:
    token_path = trial_dir / "agent" / "mux-tokens.json"
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(json.dumps(payload), encoding="utf-8")
    return token_path


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
                "n_cached_tokens": None,
                "n_cache_create_tokens": None,
                "n_reasoning_tokens": None,
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
                "n_cached_tokens": None,
                "n_cache_create_tokens": None,
                "n_reasoning_tokens": None,
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
                "n_cached_tokens": None,
                "n_cache_create_tokens": None,
                "n_reasoning_tokens": None,
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
    assert row["model"] is None
    assert row["task_id"] == trial.split("__", 1)[0]
    for key, value in expected.items():
        if isinstance(value, float):
            assert row[key] == pytest.approx(value)
        else:
            assert row[key] == value


def test_parse_trial_result_includes_model_when_provided(tmp_path: Path) -> None:
    trial_dir = _write_trial(
        tmp_path,
        "claude-code",
        "json-parse__abc",
        {"passed": True, "n_input_tokens": 1, "n_output_tokens": 2},
    )
    row = parse_trial_result(
        "claude-code", trial_dir, model="anthropic/claude-sonnet-4-5"
    )

    assert row is not None
    assert row["model"] == "anthropic/claude-sonnet-4-5"


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


def test_parse_agent_dir_name() -> None:
    assert parse_agent_dir_name("mux__gpt-5.2-pro") == ("mux", "gpt-5.2-pro")
    assert parse_agent_dir_name("claude-code__claude-opus-4-6") == (
        "claude-code",
        "claude-opus-4-6",
    )
    assert parse_agent_dir_name("mux") == ("mux", None)
    assert parse_agent_dir_name("codex") == ("codex", None)


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
    assert row["model"] is None
    assert row["passed"] is None
    assert row["score"] is None
    assert row["n_input_tokens"] is None
    assert row["n_output_tokens"] is None
    assert row["total_tokens"] is None
    assert row["n_cached_tokens"] is None
    assert row["n_cache_create_tokens"] is None
    assert row["n_reasoning_tokens"] is None
    assert row["cost_usd"] is None
    assert row["duration_sec"] is None


def test_parse_trial_result_reads_metadata_tokens(tmp_path: Path) -> None:
    row = parse_trial_result(
        "mux",
        _write_trial(
            tmp_path,
            "mux",
            "metadata-tokens__abc",
            {
                "passed": True,
                "agent_result": {
                    "n_input_tokens": 500,
                    "n_output_tokens": 200,
                    "cost_usd": 0.05,
                    "metadata": {
                        "n_cached_tokens": 100,
                        "n_cache_create_tokens": 50,
                        "n_reasoning_tokens": 25,
                    },
                },
            },
        ),
    )

    assert row is not None
    assert row["n_cached_tokens"] == 100
    assert row["n_cache_create_tokens"] == 50
    assert row["n_reasoning_tokens"] == 25


def test_parse_trial_result_falls_back_to_mux_token_file(tmp_path: Path) -> None:
    trial_dir = _write_trial(
        tmp_path,
        "mux",
        "mux-token-file__abc",
        {
            "passed": True,
            "agent_result": {
                "n_input_tokens": 500,
                "n_output_tokens": 200,
                "cost_usd": 0.05,
            },
        },
    )
    _write_mux_token_file(
        trial_dir,
        {
            "input": 500,
            "output": 200,
            "cached": 80,
            "cache_create": 40,
            "reasoning": 20,
            "cost_usd": 0.05,
        },
    )

    row = parse_trial_result("mux", trial_dir)

    assert row is not None
    assert row["n_cached_tokens"] == 80
    assert row["n_cache_create_tokens"] == 40
    assert row["n_reasoning_tokens"] == 20


def test_parse_trial_result_new_columns_null_when_absent(tmp_path: Path) -> None:
    row = parse_trial_result(
        "claude-code",
        _write_trial(
            tmp_path,
            "claude-code",
            "no-token-metrics__abc",
            {"passed": True, "n_input_tokens": 5, "n_output_tokens": 7},
        ),
    )

    assert row is not None
    assert row["n_cached_tokens"] is None
    assert row["n_cache_create_tokens"] is None
    assert row["n_reasoning_tokens"] is None


def test_write_outputs_generates_expected_json_and_csv(tmp_path: Path) -> None:
    assert len(RESULT_COLUMNS) == 13

    rows = [
        {
            "agent": "mux",
            "model": "anthropic/claude-sonnet-4-5",
            "task_id": "task-1",
            "passed": True,
            "score": 1.0,
            "n_input_tokens": 5,
            "n_output_tokens": 7,
            "total_tokens": 12,
            "n_cached_tokens": None,
            "n_cache_create_tokens": None,
            "n_reasoning_tokens": None,
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
            "model": "anthropic/claude-sonnet-4-5",
            "task_id": "task-1",
            "passed": "True",
            "score": "1.0",
            "n_input_tokens": "5",
            "n_output_tokens": "7",
            "total_tokens": "12",
            "n_cached_tokens": "",
            "n_cache_create_tokens": "",
            "n_reasoning_tokens": "",
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
    _write_timing(tmp_path, "mux", "anthropic/claude-sonnet-4-5")
    _write_timing(tmp_path, "claude-code", "anthropic/claude-sonnet-4-5")
    _write_timing(tmp_path, "codex", "openai/gpt-5.2-codex")
    (tmp_path / "empty-agent").mkdir(parents=True, exist_ok=True)

    assert main([str(tmp_path)]) == 0
    rows = collect_results(tmp_path)
    assert len(rows) == 3
    assert {row["agent"]: row["model"] for row in rows} == {
        "mux": "anthropic/claude-sonnet-4-5",
        "claude-code": "anthropic/claude-sonnet-4-5",
        "codex": "openai/gpt-5.2-codex",
    }
    assert len(json.loads((tmp_path / "data.json").read_text(encoding="utf-8"))) == 3
    assert "Collected 3 trial(s) across 3 agent(s)." in capsys.readouterr().out


def test_main_handles_empty_output_directory(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([str(tmp_path)]) == 0
    assert json.loads((tmp_path / "data.json").read_text(encoding="utf-8")) == []
    assert "Collected 0 trial(s) across 0 agent(s)." in capsys.readouterr().out


def test_collect_results_uses_base_agent_name_for_agent_model_slug_dirs(
    tmp_path: Path,
) -> None:
    _write_timing(tmp_path, "mux__gpt-5.2-pro", "openai/gpt-5.2-pro")
    _write_trial(
        tmp_path,
        "mux__gpt-5.2-pro",
        "task-a__111",
        {"passed": True, "n_input_tokens": 1, "n_output_tokens": 2},
    )
    _write_timing(tmp_path, "mux__gpt-5.3-codex", "openai/gpt-5.3-codex")
    _write_trial(
        tmp_path,
        "mux__gpt-5.3-codex",
        "task-b__222",
        {"passed": False, "n_input_tokens": 2, "n_output_tokens": 3},
    )

    rows = collect_results(tmp_path)

    assert len(rows) == 2
    assert {row["agent"] for row in rows} == {"mux"}
    assert {row["task_id"] for row in rows} == {"task-a", "task-b"}
    assert {row["model"] for row in rows} == {
        "openai/gpt-5.2-pro",
        "openai/gpt-5.3-codex",
    }


def test_collect_results_preserves_legacy_plain_agent_dirs(tmp_path: Path) -> None:
    _write_timing(tmp_path, "mux", "openai/gpt-5.2-pro")
    _write_trial(
        tmp_path,
        "mux",
        "task-a__111",
        {"passed": True, "n_input_tokens": 1, "n_output_tokens": 1},
    )
    _write_timing(tmp_path, "codex", "openai/gpt-5.2-codex")
    _write_trial(
        tmp_path,
        "codex",
        "task-b__222",
        {"passed": False, "n_input_tokens": 2, "n_output_tokens": 1},
    )

    rows = collect_results(tmp_path)

    assert len(rows) == 2
    assert {row["agent"] for row in rows} == {"mux", "codex"}
    assert {row["model"] for row in rows} == {
        "openai/gpt-5.2-pro",
        "openai/gpt-5.2-codex",
    }


def test_collect_results_reads_model_from_timing_json(tmp_path: Path) -> None:
    _write_timing(tmp_path, "claude-code", "anthropic/claude-sonnet-4-5")
    _write_trial(
        tmp_path,
        "claude-code",
        "task-a__111",
        {"passed": True, "n_input_tokens": 1, "n_output_tokens": 1},
    )
    _write_trial(
        tmp_path,
        "claude-code",
        "task-b__222",
        {"passed": False, "n_input_tokens": 1, "n_output_tokens": 2},
    )

    rows = collect_results(tmp_path)
    assert len(rows) == 2
    assert {row["model"] for row in rows} == {"anthropic/claude-sonnet-4-5"}


def test_collect_results_sets_model_none_when_timing_missing(tmp_path: Path) -> None:
    _write_trial(
        tmp_path,
        "mux",
        "task-a__111",
        {"passed": True, "n_input_tokens": 3, "n_output_tokens": 2},
    )

    rows = collect_results(tmp_path)
    assert len(rows) == 1
    assert rows[0]["model"] is None


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
    # Also write harbor.log and timing.json siblings.
    (tmp_path / "mux" / "harbor.log").write_text("log", encoding="utf-8")
    _write_timing(tmp_path, "mux", None)

    assert main([str(tmp_path)]) == 0
    rows = json.loads((tmp_path / "data.json").read_text(encoding="utf-8"))
    assert len(rows) == 1
    assert rows[0]["agent"] == "mux"
    assert rows[0]["model"] is None
    assert rows[0]["task_id"] == "chess-best-move"
    assert rows[0]["passed"] is False
    assert "Collected 1 trial(s)" in capsys.readouterr().out
