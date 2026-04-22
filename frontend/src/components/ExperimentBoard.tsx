'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BoardToolbar } from '@/components/BoardToolbar'
import { ChildBlockDialog } from '@/components/ChildBlockDialog'
import { JobPanel } from '@/components/JobPanel'
import { SelectionPanel } from '@/components/SelectionPanel'
import { experimentsApi } from '@/lib/api'
import {
  buildExperimentGraph,
  collectBranchBlocks,
  resolveBaseConfigName,
  shouldUseExplicitModel,
} from '@/lib/tree'
import type {
  BoardJob,
  BlockCreateMode,
  ExperimentBlock,
  ExperimentCatalog,
  ExperimentResult,
  ExperimentRunInfo,
  TestCase,
  TestCaseCreate,
} from '@/types/experiments'

const DEFAULT_DATASET = 'src/experiments/datasets/basic.json'

const TldrawBoardCanvas = dynamic(() => import('@/components/TldrawBoardCanvas'), {
  ssr: false,
  loading: () => <div className="board-fallback">Загрузка доски...</div>,
})

export default function ExperimentBoard() {
  const [catalog, setCatalog] = useState<ExperimentCatalog | null>(null)
  const [runs, setRuns] = useState<ExperimentRunInfo[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [selectedDataset, setSelectedDataset] = useState(DEFAULT_DATASET)
  const [results, setResults] = useState<ExperimentResult[]>([])
  const [tests, setTests] = useState<TestCase[]>([])
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [jobs, setJobs] = useState<BoardJob[]>([])
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)
  const [blockDialogMode, setBlockDialogMode] = useState<BlockCreateMode>('child')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const defaultConfigName = useMemo(
    () => results[0]?.config_name || catalog?.configs[0] || 'balanced_default',
    [catalog?.configs, results],
  )

  const graph = useMemo(
    () =>
      buildExperimentGraph({
        results,
        tests,
        fallbackRunId: selectedRunId,
        fallbackConfigName: defaultConfigName,
      }),
    [defaultConfigName, results, selectedRunId, tests],
  )

  const selectedBlocks = useMemo(
    () =>
      selectedBlockIds
        .map((blockId) => graph.blockById.get(blockId))
        .filter((block): block is ExperimentBlock => Boolean(block)),
    [graph, selectedBlockIds],
  )

  const selectedParent = selectedBlocks.length === 1 ? selectedBlocks[0] : null

  const refreshCatalogAndRuns = useCallback(async () => {
    const [nextCatalog, nextRuns, nextTests] = await Promise.all([
      experimentsApi.getCatalog(),
      experimentsApi.listRuns(),
      experimentsApi.getTests(),
    ])

    setCatalog(nextCatalog)
    setRuns(nextRuns)
    setTests(nextTests)

    const firstDataset = nextCatalog.datasets[0] ?? DEFAULT_DATASET
    setSelectedDataset((current) => current || firstDataset)

    return { catalog: nextCatalog, runs: nextRuns }
  }, [])

  const loadRun = useCallback(async (runId: string) => {
    if (!runId) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const [{ results: nextResults }, nextTests] = await Promise.all([
        experimentsApi.getRunResults(runId),
        experimentsApi.getTests(),
      ])
      setResults(nextResults)
      setTests(nextTests)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { runs: nextRuns } = await refreshCatalogAndRuns()
      const nextRunId = selectedRunId || nextRuns[0]?.run_id || ''
      setSelectedRunId(nextRunId)
      await loadRun(nextRunId)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setLoading(false)
    }
  }, [loadRun, refreshCatalogAndRuns, selectedRunId])

  useEffect(() => {
    let mounted = true

    async function boot() {
      setLoading(true)
      setError(null)

      try {
        const { catalog: nextCatalog, runs: nextRuns } = await refreshCatalogAndRuns()
        if (!mounted) return

        setSelectedDataset(nextCatalog.datasets[0] ?? DEFAULT_DATASET)

        const firstRunId = nextRuns[0]?.run_id ?? ''
        setSelectedRunId(firstRunId)
        await loadRun(firstRunId)
      } catch (nextError) {
        if (!mounted) return
        setError(nextError instanceof Error ? nextError.message : String(nextError))
        setLoading(false)
      }
    }

    boot()

    return () => {
      mounted = false
    }
  }, [loadRun, refreshCatalogAndRuns])

  useEffect(() => {
    const hasActiveJobs = jobs.some((job) => job.status === 'queued' || job.status === 'running')
    if (!hasActiveJobs) return

    const timerId = window.setInterval(async () => {
      const activeJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running')
      const statuses = await Promise.allSettled(
        activeJobs.map((job) => experimentsApi.getJob(job.jobId)),
      )

      let completedRunId: string | null = null
      setJobs((currentJobs) =>
        currentJobs.map((job) => {
          const index = activeJobs.findIndex((activeJob) => activeJob.jobId === job.jobId)
          if (index === -1) return job

          const status = statuses[index]
          if (status.status === 'rejected') {
            return { ...job, status: 'failed', error: String(status.reason) }
          }

          if (status.value.status === 'completed') {
            completedRunId =
              job.targetRunId || status.value.experiment_run_id || completedRunId
          }

          return {
            ...job,
            status: status.value.status,
            experimentRunId: status.value.experiment_run_id,
            error: status.value.error,
          }
        }),
      )

      if (completedRunId) {
        const nextRuns = await experimentsApi.listRuns()
        setRuns(nextRuns)

        setSelectedRunId(completedRunId)
        await loadRun(completedRunId)
      }
    }, 1500)

    return () => window.clearInterval(timerId)
  }, [jobs, loadRun, selectedRunId])

  const handleRunChange = useCallback(
    async (runId: string) => {
      setSelectedRunId(runId)
      await loadRun(runId)
    },
    [loadRun],
  )

  const createTest = useCallback(
    async (test: TestCaseCreate) => {
      setError(null)
      try {
        await experimentsApi.createTest(test, selectedDataset)
        setTests(await experimentsApi.getTests())
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    },
    [selectedDataset],
  )

  const startBlocks = useCallback(
    async (blocks: ExperimentBlock[], mode: 'grouped' | 'parallel') => {
      if (blocks.length === 0) return
      setError(null)

      try {
        const runnableGroups =
          mode === 'parallel'
            ? blocks.map((block) => [block])
            : groupBlocksForRuns(blocks, catalog?.configs ?? [])

        const responses = await Promise.all(
          runnableGroups.map(async (group) => {
            const first = group[0]
            const baseConfigName = resolveBaseConfigName(first.configName, catalog?.configs ?? [])
            const selectedModels =
              shouldUseExplicitModel(first.configName, catalog?.configs ?? []) && first.modelName
                ? [first.modelName]
                : undefined

            const response = await experimentsApi.startRun({
              experiment_run_id: selectedRunId || undefined,
              dataset: selectedDataset,
              selected_config_names: [baseConfigName],
              selected_test_ids: [...new Set(group.map((block) => block.testId))],
              selected_models: selectedModels,
            })

            return {
              jobId: response.job_id,
              label:
                group.length === 1
                  ? `${first.configName} / ${first.testId}`
                  : `${first.configName} / ${group.length} блоков`,
              status: response.status,
              createdAt: Date.now(),
              targetRunId: selectedRunId || undefined,
            } satisfies BoardJob
          }),
        )

        setJobs((current) => [...responses, ...current].slice(0, 20))
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      }
    },
    [catalog?.configs, selectedDataset, selectedRunId],
  )

  const handleRunSelection = useCallback(() => {
    startBlocks(selectedBlocks, 'grouped')
  }, [selectedBlocks, startBlocks])

  const handleRunBranch = useCallback(() => {
    const branchBlocks = collectBranchBlocks(graph, selectedBlockIds)
    startBlocks(branchBlocks, 'parallel')
  }, [graph, selectedBlockIds, startBlocks])

  return (
    <main className="app-shell">
      <BoardToolbar
        catalog={catalog}
        runs={runs}
        selectedRunId={selectedRunId}
        selectedDataset={selectedDataset}
        selectedCount={selectedBlocks.length}
        loading={loading}
        onRunChange={handleRunChange}
        onDatasetChange={setSelectedDataset}
        onReload={reloadAll}
        onCreateParent={() => {
          setBlockDialogMode('parent')
          setBlockDialogOpen(true)
        }}
        onCreateChild={() => {
          setBlockDialogMode('child')
          setBlockDialogOpen(true)
        }}
        onRunSelection={handleRunSelection}
        onRunBranch={handleRunBranch}
      />

      <section className="board-layout">
        {error ? <div className="error-state">{error}</div> : null}
        {!error && !loading && graph.blocks.length === 0 ? (
          <div className="empty-state">Для выбранного run нет result JSON.</div>
        ) : null}

        <div className="board-canvas">
          <TldrawBoardCanvas graph={graph} onSelectionChange={setSelectedBlockIds} />
        </div>

        <aside className="side-panel">
          <SelectionPanel selectedBlocks={selectedBlocks} />
          <JobPanel jobs={jobs} />
        </aside>
      </section>

      <ChildBlockDialog
        mode={blockDialogMode}
        open={blockDialogOpen}
        parent={selectedParent}
        configs={catalog?.configs ?? []}
        defaultConfigName={defaultConfigName}
        onClose={() => setBlockDialogOpen(false)}
        onSubmit={createTest}
      />
    </main>
  )
}

function groupBlocksForRuns(blocks: ExperimentBlock[], catalogConfigs: string[]) {
  const groups = new Map<string, ExperimentBlock[]>()

  for (const block of blocks) {
    const baseConfigName = resolveBaseConfigName(block.configName, catalogConfigs)
    const modelKey =
      shouldUseExplicitModel(block.configName, catalogConfigs) && block.modelName
        ? block.modelName
        : ''
    const groupKey = `${baseConfigName}:${modelKey}`
    const group = groups.get(groupKey) ?? []
    group.push(block)
    groups.set(groupKey, group)
  }

  return [...groups.values()]
}
