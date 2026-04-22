from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ExperimentRunRequest(BaseModel):
    experiment_run_id: Optional[str] = None
    dataset: str = Field(default="src/experiments/datasets/basic.json")
    configs_dir: str = Field(default="src/experiments/configs")
    selected_config_names: Optional[List[str]] = None
    selected_test_ids: Optional[List[str]] = None
    selected_models: Optional[List[str]] = None
    use_all_models: bool = False
    default_model: Optional[str] = None
    timeout_seconds: int = 120
    db_path: str = "src/experiments/results/results.sqlite3"
    output_dir: str = "src/experiments/results"


class ExperimentRunResponse(BaseModel):
    job_id: str
    status: str


class ExperimentJobStatus(BaseModel):
    job_id: str
    status: str
    experiment_run_id: Optional[str] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


class ExperimentCatalogResponse(BaseModel):
    datasets: List[str]
    configs: List[str]
    tests: List[str]
    models: List[str]


class ExperimentRunInfo(BaseModel):
    run_id: str
    files: List[str]


class ExperimentRunDetail(BaseModel):
    run_id: str
    manifest: Dict[str, Any]
    configs: Dict[str, List[str]]


class ConfigProfileCreate(BaseModel):
    name: str
    model: Optional[str] = None
    runtime_params: Dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None


class ConfigProfileUpdate(BaseModel):
    model: Optional[str] = None
    runtime_params: Optional[Dict[str, Any]] = None
    description: Optional[str] = None


class TestCaseCreate(BaseModel):
    id: str
    input: str
    checks: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)


class TestCaseUpdate(BaseModel):
    input: Optional[str] = None
    checks: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
