import type { ExperimentCatalog, ExperimentRunInfo } from '@/types/experiments'

interface BoardToolbarProps {
  catalog: ExperimentCatalog | null
  runs: ExperimentRunInfo[]
  selectedRunId: string
  selectedDataset: string
  selectedCount: number
  loading: boolean
  onRunChange: (runId: string) => void
  onDatasetChange: (dataset: string) => void
  onReload: () => void
  onCreateParent: () => void
  onCreateChild: () => void
  onRunSelection: () => void
  onRunBranch: () => void
}

export function BoardToolbar({
  catalog,
  runs,
  selectedRunId,
  selectedDataset,
  selectedCount,
  loading,
  onRunChange,
  onDatasetChange,
  onReload,
  onCreateParent,
  onCreateChild,
  onRunSelection,
  onRunBranch,
}: BoardToolbarProps) {
  return (
    <header className="topbar">
      <div className="topbar__group">
        <label className="topbar__label">
          Run
          <select
            value={selectedRunId}
            onChange={(event) => onRunChange(event.target.value)}
            disabled={loading || runs.length === 0}
          >
            {runs.length === 0 ? <option value="">Нет run</option> : null}
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.run_id}
              </option>
            ))}
          </select>
        </label>

        <label className="topbar__label">
          Dataset
          <select
            value={selectedDataset}
            onChange={(event) => onDatasetChange(event.target.value)}
            disabled={loading || !catalog?.datasets.length}
          >
            {(catalog?.datasets.length ? catalog.datasets : [selectedDataset]).map((dataset) => (
              <option key={dataset} value={dataset}>
                {dataset}
              </option>
            ))}
          </select>
        </label>

        <button className="topbar__button" type="button" onClick={onReload} disabled={loading}>
          Обновить
        </button>
      </div>

      <div className="topbar__group">
        <span className="topbar__meta">Выбрано: {selectedCount}</span>
        <button className="topbar__button" type="button" onClick={onCreateParent}>
          Новый родитель
        </button>
        <button
          className="topbar__button"
          type="button"
          onClick={onCreateChild}
          disabled={selectedCount !== 1}
        >
          Новый ребёнок
        </button>
        <button
          className="topbar__button topbar__button--primary"
          type="button"
          onClick={onRunSelection}
          disabled={selectedCount === 0}
        >
          Запустить
        </button>
        <button
          className="topbar__button"
          type="button"
          onClick={onRunBranch}
          disabled={selectedCount === 0}
        >
          Запустить ветку
        </button>
      </div>
    </header>
  )
}
