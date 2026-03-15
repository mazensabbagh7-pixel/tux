from __future__ import annotations

import io
import json
import tarfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

from .mux_agent import MuxAgent
from .mux_payload import build_app_archive


@dataclass
class StubAgentContext:
    n_input_tokens: int | None = None
    n_output_tokens: int | None = None
    cost_usd: float | None = None
    metadata: dict[str, Any] | None = None


@pytest.fixture(autouse=True)
def _clear_mux_env(monkeypatch: pytest.MonkeyPatch) -> None:
    keys = (*MuxAgent._PROVIDER_ENV_KEYS, *MuxAgent._CONFIG_ENV_KEYS)
    for key in keys:
        monkeypatch.delenv(key, raising=False)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _make_agent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> MuxAgent:
    monkeypatch.setenv("MUX_AGENT_REPO_ROOT", str(_repo_root()))
    return MuxAgent(logs_dir=tmp_path)


def test_env_defaults_are_normalized(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    agent = _make_agent(tmp_path, monkeypatch)
    agent._model_name = "anthropic/claude-sonnet-4-5"

    env = agent._env

    assert env["MUX_MODEL"] == "anthropic:claude-sonnet-4-5"
    assert env["MUX_CONFIG_ROOT"] == "/root/.mux"
    assert env["MUX_APP_ROOT"] == "/opt/mux-app"
    assert env["MUX_WORKSPACE_ID"] == "mux-bench"
    assert env["MUX_PROJECT_CANDIDATES"] == agent._DEFAULT_PROJECT_CANDIDATES


def test_timeout_must_be_numeric(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MUX_AGENT_REPO_ROOT", str(_repo_root()))
    monkeypatch.setenv("MUX_TIMEOUT_MS", "not-a-number")

    agent = MuxAgent(logs_dir=tmp_path)
    with pytest.raises(ValueError):
        _ = agent._env


def test_app_archive_includes_postinstall_script() -> None:
    assert "scripts/postinstall.sh" in MuxAgent._INCLUDE_PATHS

    repo_root = _repo_root()
    postinstall = repo_root / "scripts/postinstall.sh"
    assert postinstall.is_file()

    archive_bytes = build_app_archive(repo_root, ["scripts/postinstall.sh"])
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
        assert "scripts/postinstall.sh" in archive.getnames()


def test_populate_context_reads_all_token_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    agent = _make_agent(tmp_path, monkeypatch)
    (tmp_path / "mux-tokens.json").write_text(
        json.dumps(
            {
                "input": 1000,
                "output": 500,
                "cached": 200,
                "cache_create": 100,
                "reasoning": 50,
                "cost_usd": 0.05,
            }
        )
    )
    context = StubAgentContext()

    agent.populate_context_post_run(context)

    assert context.n_input_tokens == 1000
    assert context.n_output_tokens == 500
    assert context.cost_usd == 0.05
    assert context.metadata == {
        "n_cached_tokens": 200,
        "n_cache_create_tokens": 100,
        "n_reasoning_tokens": 50,
    }


def test_populate_context_handles_missing_extra_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    agent = _make_agent(tmp_path, monkeypatch)
    (tmp_path / "mux-tokens.json").write_text(
        json.dumps({"input": 1000, "output": 500, "cost_usd": 0.05})
    )
    context = StubAgentContext()

    agent.populate_context_post_run(context)

    assert context.n_input_tokens == 1000
    assert context.n_output_tokens == 500
    assert context.cost_usd == 0.05
    assert context.metadata == {
        "n_cached_tokens": 0,
        "n_cache_create_tokens": 0,
        "n_reasoning_tokens": 0,
    }


def test_extract_tokens_from_stdout_reads_all_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    agent = _make_agent(tmp_path, monkeypatch)
    command_dir = tmp_path / "command-0"
    command_dir.mkdir()
    (command_dir / "stdout.txt").write_text(
        "\n".join(
            [
                '{"type":"stream","message":"ignore me"}',
                json.dumps(
                    {
                        "type": "run-complete",
                        "usage": {
                            "inputTokens": 800,
                            "outputTokens": 400,
                            "cachedTokens": 150,
                            "cacheCreateTokens": 75,
                            "reasoningTokens": 30,
                        },
                        "cost_usd": 0.03,
                    }
                ),
            ]
        )
    )
    context = StubAgentContext()

    agent._extract_tokens_from_stdout(context)

    assert context.n_input_tokens == 800
    assert context.n_output_tokens == 400
    assert context.cost_usd == 0.03
    assert context.metadata == {
        "n_cached_tokens": 150,
        "n_cache_create_tokens": 75,
        "n_reasoning_tokens": 30,
    }


def test_extract_tokens_from_stdout_handles_missing_new_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    agent = _make_agent(tmp_path, monkeypatch)
    command_dir = tmp_path / "command-0"
    command_dir.mkdir()
    (command_dir / "stdout.txt").write_text(
        json.dumps(
            {
                "type": "run-complete",
                "usage": {"inputTokens": 800, "outputTokens": 400},
                "cost_usd": 0.03,
            }
        )
    )
    context = StubAgentContext()

    agent._extract_tokens_from_stdout(context)

    assert context.n_input_tokens == 800
    assert context.n_output_tokens == 400
    assert context.cost_usd == 0.03
    assert context.metadata == {
        "n_cached_tokens": 0,
        "n_cache_create_tokens": 0,
        "n_reasoning_tokens": 0,
    }
