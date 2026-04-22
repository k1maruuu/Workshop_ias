export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export interface ExperimentCatalog {
  datasets: string[]
  configs: string[]
  tests: string[]
  models: string[]
}

export interface ExperimentRunInfo {
  run_id: string
  files: string[]
}

export interface ExperimentRunDetail {
  run_id: string
  manifest: JsonObject
  configs: Record<string, string[]>
}

export interface ExperimentResult {
  experiment_run_id: string
  test_id: string
  config_name: string
  model_name?: string | null
  input_text: string
  response_text: string
  score: number
  passed: boolean
  latency_ms: number
  timestamp_utc: string
  thread_id?: string | null
  trace_id?: string | null
  runtime_params?: JsonObject
  raw_response?: JsonValue
  scoring?: JsonValue
}

export interface TestCase {
  id: string
  input: string
  checks: JsonObject
  tags: string[]
  runtime_params?: JsonObject
}

export interface TestCaseCreate {
  id: string
  input: string
  checks: JsonObject
  tags: string[]
  runtime_params?: JsonObject
}

export interface ExperimentRunRequest {
  experiment_run_id?: string | null
  dataset?: string
  configs_dir?: string
  selected_config_names?: string[]
  selected_test_ids?: string[]
  selected_models?: string[]
  use_all_models?: boolean
  default_model?: string | null
  timeout_seconds?: number
  db_path?: string
  output_dir?: string
}

export interface ExperimentRunResponse {
  job_id: string
  status: string
}

export interface ExperimentJobStatus {
  job_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | string
  experiment_run_id?: string | null
  error?: string | null
  result?: JsonObject | null
}

export interface ParentBlockRef {
  runId: string
  configName: string
  testId: string
  blockId: string
}

export interface ParsedTags {
  parentTestIds: string[]
  parentBlocks: ParentBlockRef[]
  branchName?: string
  boardConfigName?: string
  ordinaryTags: string[]
}

export interface ExperimentBlock {
  id: string
  source: 'result' | 'draft'
  runId: string
  configName: string
  testId: string
  title: string
  inputText: string
  responseText: string
  modelName?: string | null
  runtimeParams: JsonObject
  score?: number
  passed?: boolean
  latencyMs?: number
  timestampUtc?: string
  traceId?: string | null
  rawResponse?: JsonValue
  scoring?: JsonValue
  tags: string[]
  branchName?: string
  parentBlockId?: string
  checks?: JsonObject
}

export type BlockCreateMode = 'parent' | 'child'

export interface PositionedBlock extends ExperimentBlock {
  x: number
  y: number
}

export interface ExperimentEdge {
  id: string
  parentId: string
  childId: string
}

export interface ExperimentGraph {
  blocks: ExperimentBlock[]
  positionedBlocks: PositionedBlock[]
  edges: ExperimentEdge[]
  childrenByParent: Map<string, ExperimentBlock[]>
  blockById: Map<string, ExperimentBlock>
}

export interface BoardJob {
  jobId: string
  label: string
  status: ExperimentJobStatus['status']
  createdAt: number
  targetRunId?: string
  experimentRunId?: string | null
  error?: string | null
}
