import argparse
import json
import re
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.experiments.report import write_csv, write_summary
from src.experiments.scoring import score_response
from src.experiments.storage import init_db, save_result


CURRENT_FILE = Path(__file__).resolve()
EXPERIMENTS_DIR = CURRENT_FILE.parent
SRC_DIR = EXPERIMENTS_DIR.parent
PROJECT_ROOT = SRC_DIR.parent


def _safe_name(value: str) -> str:
    value = value.strip()
    value = re.sub(r'[<>:"/\\|?*\s]+', "_", value)
    return value[:120] or "unnamed"


def resolve_path(path_str: str, *, expect_dir: bool = False) -> Path:
    raw = Path(path_str)
    candidates = []

    if raw.is_absolute():
        candidates.append(raw)
    else:
        candidates.append(raw)
        candidates.append(PROJECT_ROOT / raw)
        candidates.append(SRC_DIR / raw)
        candidates.append(EXPERIMENTS_DIR / raw)

    for candidate in candidates:
        if expect_dir and candidate.is_dir():
            return candidate
        if not expect_dir and candidate.is_file():
            return candidate

    checked = "\n".join(f"- {str(c)}" for c in candidates)
    kind = "directory" if expect_dir else "file"
    raise FileNotFoundError(f"Could not find {kind}: {path_str}\nChecked:\n{checked}")


def load_dataset(dataset_path: str | Path) -> List[Dict[str, Any]]:
    dataset_file = resolve_path(str(dataset_path), expect_dir=False)
    return json.loads(dataset_file.read_text(encoding="utf-8"))


def load_configs(configs_dir: str | Path) -> List[Dict[str, Any]]:
    configs_path = resolve_path(str(configs_dir), expect_dir=True)
    configs: List[Dict[str, Any]] = []

    for file_path in sorted(configs_path.glob("*.json")):
        configs.append(json.loads(file_path.read_text(encoding="utf-8")))

    if not configs:
        raise FileNotFoundError(f"No config JSON files found in: {configs_path}")

    return configs


def filter_dataset(
    dataset: List[Dict[str, Any]],
    selected_test_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    if not selected_test_ids:
        return dataset

    wanted = set(selected_test_ids)
    filtered = [case for case in dataset if case.get("id") in wanted]

    if not filtered:
        raise ValueError(f"No tests matched selected_test_ids={selected_test_ids}")

    return filtered


def _extract_response_text(response_json: Dict[str, Any]) -> str:
    choices = response_json.get("choices") or []
    if not choices:
        return ""

    first = choices[0] or {}
    message = first.get("message") or {}
    content = message.get("content")
    return content if isinstance(content, str) else ""


def _extract_trace_id(headers: Dict[str, str]) -> str | None:
    for key in ("x-trace-id", "trace-id", "x_trace_id"):
        if key in headers:
            return headers[key]
    return None


def call_chat_completion(
    *,
    base_url: str,
    model: str | None,
    prompt: str,
    runtime_params: Dict[str, Any],
    thread_id: str,
    timeout_seconds: int,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "stream": False,
        "messages": [{"role": "user", "content": prompt}],
        "thread_id": thread_id,
        "runtime_params": runtime_params,
    }

    if model:
        payload["model"] = model

    request = urllib.request.Request(
        url=f"{base_url.rstrip('/')}/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    started = time.perf_counter()

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8")
            latency_ms = (time.perf_counter() - started) * 1000.0
            response_json = json.loads(body)
            headers = {k.lower(): v for k, v in response.headers.items()}

            return {
                "ok": True,
                "response_json": response_json,
                "response_text": _extract_response_text(response_json),
                "latency_ms": latency_ms,
                "trace_id": _extract_trace_id(headers),
                "headers": headers,
            }

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        latency_ms = (time.perf_counter() - started) * 1000.0

        return {
            "ok": False,
            "response_json": {"error": {"status": e.code, "body": body}},
            "response_text": body,
            "latency_ms": latency_ms,
            "trace_id": None,
            "headers": {},
        }

    except Exception as e:
        latency_ms = (time.perf_counter() - started) * 1000.0

        return {
            "ok": False,
            "response_json": {"error": {"type": e.__class__.__name__, "message": str(e)}},
            "response_text": str(e),
            "latency_ms": latency_ms,
            "trace_id": None,
            "headers": {},
        }


def save_test_result_json(
    *,
    run_dir: Path,
    config_name: str,
    test_id: str,
    row: Dict[str, Any],
) -> None:
    config_dir = run_dir / _safe_name(config_name)
    config_dir.mkdir(parents=True, exist_ok=True)

    test_file = config_dir / f"{_safe_name(test_id)}.json"
    payload = {
        "experiment_run_id": row["experiment_run_id"],
        "test_id": row["test_id"],
        "config_name": row["config_name"],
        "model_name": row.get("model_name"),
        "input_text": row["input_text"],
        "response_text": row["response_text"],
        "score": row["score"],
        "passed": row["passed"],
        "latency_ms": row["latency_ms"],
        "timestamp_utc": row["timestamp_utc"],
        "thread_id": row.get("thread_id"),
        "trace_id": row.get("trace_id"),
        "runtime_params": row.get("runtime_params", {}),
        "raw_response": row.get("raw_response", {}),
        "scoring": row.get("scoring", {}),
    }

    test_file.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def save_run_manifest(
    *,
    run_dir: Path,
    experiment_run_id: str,
    dataset_path: str,
    selected_configs: List[str],
    selected_tests: List[str],
    selected_models: List[str],
    total_jobs: int,
) -> None:
    manifest = {
        "experiment_run_id": experiment_run_id,
        "dataset_path": dataset_path,
        "selected_configs": selected_configs,
        "selected_tests": selected_tests,
        "selected_models": selected_models,
        "total_jobs": total_jobs,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
    }

    (run_dir / "run.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def prepare_matrix(
    *,
    configs: List[Dict[str, Any]],
    default_model: Optional[str],
    selected_config_names: Optional[List[str]] = None,
    selected_models: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    config_name_set = set(selected_config_names or [])

    filtered_configs = [
        cfg for cfg in configs
        if not config_name_set or cfg["name"] in config_name_set
    ]

    if not filtered_configs:
        raise ValueError("No configs matched selected_config_names")

    models = [m for m in (selected_models or []) if m]

    matrix: List[Dict[str, Any]] = []

    if models:
        for cfg in filtered_configs:
            for model_name in models:
                matrix.append(
                    {
                        "config_name": f"{cfg['name']}__{_safe_name(model_name)}",
                        "base_config_name": cfg["name"],
                        "runtime_params": cfg.get("runtime_params", {}),
                        "model": model_name,
                    }
                )
    else:
        for cfg in filtered_configs:
            matrix.append(
                {
                    "config_name": cfg["name"],
                    "base_config_name": cfg["name"],
                    "runtime_params": cfg.get("runtime_params", {}),
                    "model": cfg.get("model") or default_model,
                }
            )

    return matrix


def run_experiment(
    *,
    dataset_path: str,
    configs_dir: str,
    base_url: str,
    default_model: str | None,
    db_path: str,
    output_dir: str,
    timeout_seconds: int,
    selected_config_names: Optional[List[str]] = None,
    selected_test_ids: Optional[List[str]] = None,
    selected_models: Optional[List[str]] = None,
    experiment_run_id: Optional[str] = None,
) -> Dict[str, Any]:
    dataset = load_dataset(dataset_path)
    dataset = filter_dataset(dataset, selected_test_ids=selected_test_ids)
    configs = load_configs(configs_dir)

    experiment_run_id = _safe_name(experiment_run_id) if experiment_run_id else uuid.uuid4().hex
    timestamp_utc = datetime.now(timezone.utc).isoformat()

    db_file = PROJECT_ROOT / db_path if not Path(db_path).is_absolute() else Path(db_path)
    output_root = PROJECT_ROOT / output_dir if not Path(output_dir).is_absolute() else Path(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)

    run_dir = output_root / experiment_run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    matrix = prepare_matrix(
        configs=configs,
        default_model=default_model,
        selected_config_names=selected_config_names,
        selected_models=selected_models,
    )

    conn = init_db(db_file)
    results: List[Dict[str, Any]] = []

    save_run_manifest(
        run_dir=run_dir,
        experiment_run_id=experiment_run_id,
        dataset_path=dataset_path,
        selected_configs=[item["base_config_name"] for item in matrix],
        selected_tests=[case["id"] for case in dataset],
        selected_models=[item["model"] for item in matrix if item.get("model")],
        total_jobs=len(matrix) * len(dataset),
    )

    for config_item in matrix:
        config_name = config_item["config_name"]
        runtime_params = config_item["runtime_params"]
        model = config_item["model"]

        for case in dataset:
            test_id = case["id"]
            prompt = case["input"]
            thread_id = f"{experiment_run_id}:{config_name}:{test_id}"

            raw = call_chat_completion(
                base_url=base_url,
                model=model,
                prompt=prompt,
                runtime_params=runtime_params,
                thread_id=thread_id,
                timeout_seconds=timeout_seconds,
            )

            scoring = score_response(raw["response_text"], case.get("checks"))

            row = {
                "experiment_run_id": experiment_run_id,
                "test_id": test_id,
                "config_name": config_name,
                "model_name": model,
                "input_text": prompt,
                "response_text": raw["response_text"],
                "score": scoring["score"],
                "passed": scoring["passed"],
                "latency_ms": raw["latency_ms"],
                "timestamp_utc": timestamp_utc,
                "thread_id": thread_id,
                "trace_id": raw.get("trace_id"),
                "runtime_params": runtime_params,
                "raw_response": raw["response_json"],
                "scoring": scoring,
            }

            save_result(conn, row)
            results.append(row)

            save_test_result_json(
                run_dir=run_dir,
                config_name=config_name,
                test_id=test_id,
                row=row,
            )

            print(
                f"[{config_name}] {test_id}: "
                f"passed={row['passed']} score={row['score']:.4f} "
                f"latency={row['latency_ms']:.2f}ms"
            )

    write_csv(results, run_dir / "results.csv")
    write_summary(results, run_dir / "summary.md")

    return {
        "experiment_run_id": experiment_run_id,
        "results_count": len(results),
        "output_dir": str(run_dir),
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run parameter experiments for workshop.")
    parser.add_argument("--dataset", default="src/experiments/datasets/basic.json")
    parser.add_argument("--configs", default="src/experiments/configs")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--model", default=None)
    parser.add_argument("--db-path", default="src/experiments/results/results.sqlite3")
    parser.add_argument("--output-dir", default="src/experiments/results")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--experiment-run-id", default=None)
    return parser


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    run_experiment(
        dataset_path=args.dataset,
        configs_dir=args.configs,
        base_url=args.base_url,
        default_model=args.model,
        db_path=args.db_path,
        output_dir=args.output_dir,
        timeout_seconds=args.timeout_seconds,
        experiment_run_id=args.experiment_run_id,
    )


if __name__ == "__main__":
    main()
