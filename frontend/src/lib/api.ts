import type {
  ExperimentCatalog,
  ExperimentJobStatus,
  ExperimentResult,
  ExperimentRunDetail,
  ExperimentRunInfo,
  ExperimentRunRequest,
  ExperimentRunResponse,
  TestCase,
  TestCaseCreate,
} from '@/types/experiments'

const DEFAULT_API_URL = '/api/experiments'

export const experimentsApiBaseUrl =
  process.env.NEXT_PUBLIC_EXPERIMENTS_API_URL ?? DEFAULT_API_URL

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const rawUrl = `${experimentsApiBaseUrl.replace(/\/$/, '')}${path}`
  const url = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? new URL(rawUrl)
    : new URL(rawUrl, typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin)

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  })

  return url.toString()
}

async function fetchJson<T>(path: string, init?: RequestInit, query?: Record<string, string>) {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`HTTP ${response.status}: ${details || response.statusText}`)
  }

  return (await response.json()) as T
}

export const experimentsApi = {
  getCatalog() {
    return fetchJson<ExperimentCatalog>('/catalog')
  },

  listRuns() {
    return fetchJson<ExperimentRunInfo[]>('/runs')
  },

  getRunDetail(runId: string) {
    return fetchJson<ExperimentRunDetail>(`/runs/${encodeURIComponent(runId)}`)
  },

  async getRunResults(runId: string) {
    const detail = await experimentsApi.getRunDetail(runId)
    const requests = Object.entries(detail.configs).flatMap(([configName, files]) =>
      files
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) =>
          fetchJson<ExperimentResult>(
            `/runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(
              configName,
            )}/${encodeURIComponent(fileName)}`,
          ),
        ),
    )

    return {
      detail,
      results: await Promise.all(requests),
    }
  },

  getTests() {
    return fetchJson<TestCase[]>('/tests')
  },

  createTest(test: TestCaseCreate, dataset: string) {
    return fetchJson<TestCase>(
      '/tests',
      {
        method: 'POST',
        body: JSON.stringify(test),
      },
      { dataset },
    )
  },

  startRun(request: ExperimentRunRequest) {
    return fetchJson<ExperimentRunResponse>('/run', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  getJob(jobId: string) {
    return fetchJson<ExperimentJobStatus>(`/jobs/${encodeURIComponent(jobId)}`)
  },
}
