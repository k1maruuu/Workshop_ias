import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'

type RouteContext = {
  params: Promise<{ path?: string[] }>
}

export const runtime = 'nodejs'

const PROJECT_ROOT = join(process.cwd(), '..')
const RESULTS_ROOT = join(PROJECT_ROOT, 'src', 'experiments', 'results')
const DATASETS_ROOT = join(PROJECT_ROOT, 'src', 'experiments', 'datasets')
const CONFIGS_ROOT = join(PROJECT_ROOT, 'src', 'experiments', 'configs')
const TESTS_ROOT = join(PROJECT_ROOT, 'src', 'experiments', 'tests')
const DEFAULT_DATASET = 'src/experiments/datasets/basic.json'
const BACKEND_URL =
  process.env.EXPERIMENTS_BACKEND_URL ?? 'http://localhost:8000/v1/experiments'

type LocalJob = {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  experimentRunId?: string | null
  error?: string | null
  result?: Record<string, unknown> | null
  startedAt: number
}

const LOCAL_JOB_STORE = new Map<string, LocalJob>()

function safeName(value: string) {
  return (value.trim().replace(/[<>:"/\\|?*\s]+/g, '_').slice(0, 120) || 'unnamed')
}

function json(value: unknown, init?: ResponseInit) {
  return NextResponse.json(value, init)
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8')
}

function trimLog(value: string) {
  const trimmed = value.trim()
  if (trimmed.length <= 1800) return trimmed
  return `${trimmed.slice(0, 1800)}...`
}

function pythonCommand() {
  const configured = process.env.PYTHON?.trim()

  if (configured) {
    try {
      if (existsSync(configured) && statSync(configured).isDirectory()) {
        const executable = join(configured, process.platform === 'win32' ? 'python.exe' : 'python')
        if (existsSync(executable)) return executable
        return 'python'
      }
    } catch {
      return 'python'
    }

    return configured
  }

  return 'python'
}

function startLocalExperimentRun(body: Record<string, unknown>) {
  const jobId = `local_${randomUUID().replace(/-/g, '')}`
  const job: LocalJob = {
    jobId,
    status: 'queued',
    experimentRunId: null,
    error: null,
    result: null,
    startedAt: Date.now(),
  }
  LOCAL_JOB_STORE.set(jobId, job)

  const script = `
import json
import sys
from src.experiments.runner import run_experiment

body = json.loads(sys.argv[1])

def optional_list(key):
    value = body.get(key)
    return value if isinstance(value, list) else None

result = run_experiment(
    experiment_run_id=body.get("experiment_run_id"),
    dataset_path=body.get("dataset") or "src/experiments/datasets/basic.json",
    configs_dir=body.get("configs_dir") or "src/experiments/configs",
    base_url=body.get("base_url") or "http://localhost:8000",
    default_model=body.get("default_model"),
    db_path=body.get("db_path") or "src/experiments/results/results.sqlite3",
    output_dir=body.get("output_dir") or "src/experiments/results",
    timeout_seconds=int(body.get("timeout_seconds") or 120),
    selected_config_names=optional_list("selected_config_names"),
    selected_test_ids=optional_list("selected_test_ids"),
    selected_models=optional_list("selected_models"),
)
print("__EXPERIMENT_RESULT__" + json.dumps(result, ensure_ascii=False))
`

  const child = spawn(pythonCommand(), ['-c', script, JSON.stringify(body)], {
    cwd: PROJECT_ROOT,
    env: process.env,
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  job.status = 'running'

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })

  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  child.on('error', (error) => {
    job.status = 'failed'
    job.error = `${error.name}: ${error.message}`
  })

  child.on('close', (code) => {
    if (job.status === 'failed') return

    const marker = '__EXPERIMENT_RESULT__'
    const markerIndex = stdout.lastIndexOf(marker)

    if (code !== 0 || markerIndex < 0) {
      job.status = 'failed'
      job.error = trimLog(stderr || stdout || `runner exited with code ${code}`)
      return
    }

    try {
      const resultLine = stdout
        .slice(markerIndex + marker.length)
        .trim()
        .split(/\\r?\\n/)[0]
      const result = JSON.parse(resultLine) as Record<string, unknown>
      job.status = 'completed'
      job.result = result
      job.experimentRunId =
        typeof result.experiment_run_id === 'string' ? result.experiment_run_id : null
    } catch (error) {
      job.status = 'failed'
      job.error = error instanceof Error ? error.message : String(error)
    }
  })

  return {
    job_id: jobId,
    status: 'queued',
  }
}

function isInside(root: string, target: string) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !rel.includes(':'))
}

function datasetPath(dataset: string) {
  const path = dataset.startsWith('src/')
    ? join(PROJECT_ROOT, dataset)
    : join(DATASETS_ROOT, dataset)

  if (!isInside(PROJECT_ROOT, path)) {
    throw new Error('Unsafe dataset path')
  }

  return path
}

function listJsonFiles(root: string) {
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
}

function listRuns() {
  if (!existsSync(RESULTS_ROOT)) return []

  return readdirSync(RESULTS_ROOT, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((item) => {
      const runDir = join(RESULTS_ROOT, item.name)
      const files: string[] = []

      for (const child of readdirSync(runDir, { withFileTypes: true })) {
        if (child.isFile() && child.name.endsWith('.json')) {
          files.push(child.name)
        }

        if (child.isDirectory()) {
          for (const resultFile of listJsonFiles(join(runDir, child.name))) {
            files.push(`${child.name}/${resultFile}`)
          }
        }
      }

      return { run_id: item.name, files: files.sort() }
    })
}

function listTests() {
  const testsById = new Map<string, Record<string, unknown>>()

  for (const datasetFile of listJsonFiles(DATASETS_ROOT)) {
    const cases = readJson<Record<string, unknown>[]>(join(DATASETS_ROOT, datasetFile))
    for (const test of cases) {
      const id = String(test.id ?? '')
      if (id) testsById.set(id, test)
    }
  }

  if (existsSync(TESTS_ROOT)) {
    for (const fileName of listJsonFiles(TESTS_ROOT)) {
      const test = readJson<Record<string, unknown>>(join(TESTS_ROOT, fileName))
      const id = String(test.id ?? '')
      if (id) testsById.set(id, test)
    }
  }

  return [...testsById.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

function saveTestToDataset(dataset: string, test: Record<string, unknown>) {
  const path = datasetPath(dataset || DEFAULT_DATASET)
  const cases = existsSync(path) ? readJson<Record<string, unknown>[]>(path) : []
  const testId = test.id
  const index = cases.findIndex((item) => item.id === testId)

  if (index >= 0) {
    cases[index] = test
  } else {
    cases.push(test)
  }

  writeJson(path, cases)
}

async function proxyToWorkshop(request: NextRequest, path: string[]) {
  const url = new URL(`${BACKEND_URL.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}`)
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value))

  const response = await fetch(url, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: request.method === 'GET' ? undefined : await request.text(),
  })

  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
  })
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params

  try {
    if (path[0] === 'catalog') {
      return json({
        datasets: listJsonFiles(DATASETS_ROOT).map((fileName) => `src/experiments/datasets/${fileName}`),
        configs: listJsonFiles(CONFIGS_ROOT).map((fileName) => fileName.replace(/\.json$/, '')),
        tests: listTests().map((test) => String(test.id)),
        models: [],
      })
    }

    if (path[0] === 'tests') {
      return json(listTests())
    }

    if (path[0] === 'configs') {
      return json(listJsonFiles(CONFIGS_ROOT).map((fileName) => readJson(join(CONFIGS_ROOT, fileName))))
    }

    if (path[0] === 'runs' && path.length === 1) {
      return json(listRuns())
    }

    if (path[0] === 'runs' && path[1] && path.length === 2) {
      const runDir = join(RESULTS_ROOT, safeName(path[1]))
      if (!existsSync(runDir) || !isInside(RESULTS_ROOT, runDir)) {
        return json({ detail: 'Run not found' }, { status: 404 })
      }

      const manifestPath = join(runDir, 'run.json')
      const configs: Record<string, string[]> = {}

      for (const item of readdirSync(runDir, { withFileTypes: true })) {
        if (item.isDirectory()) {
          configs[item.name] = listJsonFiles(join(runDir, item.name))
        }
      }

      return json({
        run_id: path[1],
        manifest: existsSync(manifestPath) ? readJson(manifestPath) : {},
        configs,
      })
    }

    if (path[0] === 'runs' && path[1] && path[2] === 'files' && path[3] && path[4]) {
      const filePath = join(RESULTS_ROOT, safeName(path[1]), safeName(path[3]), safeName(path[4]))
      if (!isInside(RESULTS_ROOT, filePath) || !existsSync(filePath)) {
        return json({ detail: 'Result file not found' }, { status: 404 })
      }

      return json(readJson(filePath))
    }

    if (path[0] === 'jobs' && path[1]) {
      const localJob = LOCAL_JOB_STORE.get(path[1])
      if (localJob) {
        return json({
          job_id: localJob.jobId,
          status: localJob.status,
          experiment_run_id: localJob.experimentRunId ?? null,
          error: localJob.error ?? null,
          result: localJob.result ?? null,
        })
      }

      return proxyToWorkshop(request, path)
    }

    return json({ detail: 'Not found' }, { status: 404 })
  } catch (error) {
    return json(
      { detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params

  try {
    if (path[0] === 'tests') {
      const test = (await request.json()) as Record<string, unknown>
      const id = String(test.id ?? '')
      if (!id) return json({ detail: 'id is required' }, { status: 400 })

      const normalized = {
        id,
        input: String(test.input ?? ''),
        runtime_params:
          test.runtime_params && typeof test.runtime_params === 'object' && !Array.isArray(test.runtime_params)
            ? test.runtime_params
            : {},
        checks: test.checks ?? {},
        tags: Array.isArray(test.tags) ? test.tags : [],
      }

      const testPath = join(TESTS_ROOT, `${safeName(id)}.json`)
      writeJson(testPath, normalized)
      saveTestToDataset(request.nextUrl.searchParams.get('dataset') ?? DEFAULT_DATASET, normalized)
      return json(normalized)
    }

    if (path[0] === 'run') {
      const body = (await request.json()) as Record<string, unknown>
      return json(startLocalExperimentRun(body))
    }

    return json({ detail: 'Not found' }, { status: 404 })
  } catch (error) {
    return json(
      { detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyToWorkshop(request, (await context.params).path ?? [])
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params

  try {
    if (path[0] === 'tests' && path[1]) {
      const testPath = join(TESTS_ROOT, `${safeName(path[1])}.json`)
      if (existsSync(testPath) && isInside(TESTS_ROOT, testPath)) {
        unlinkSync(testPath)
      }
      return json({ deleted: true, test_id: path[1] })
    }

    return proxyToWorkshop(request, path)
  } catch (error) {
    return json(
      { detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
