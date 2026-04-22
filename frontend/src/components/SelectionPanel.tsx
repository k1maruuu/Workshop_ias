import type { ExperimentBlock } from '@/types/experiments'

export function SelectionPanel({ selectedBlocks }: { selectedBlocks: ExperimentBlock[] }) {
  if (selectedBlocks.length === 0) {
    return (
      <section className="panel-card">
        <div className="panel-card__header">
          <h2 className="panel-card__title">Детали блока</h2>
        </div>
        <div className="panel-card__body">
          <p className="panel-card__hint">Выберите блок на доске.</p>
        </div>
      </section>
    )
  }

  if (selectedBlocks.length > 1) {
    return (
      <section className="panel-card">
        <div className="panel-card__header">
          <h2 className="panel-card__title">Выбрано блоков: {selectedBlocks.length}</h2>
        </div>
        <div className="panel-card__body">
          {selectedBlocks.slice(0, 10).map((block) => (
            <div className="panel-card__row" key={block.id}>
              <span>{block.configName}</span>
              <strong>{block.testId}</strong>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const block = selectedBlocks[0]
  const changedFields = block.tags
    .filter((tag) => tag.startsWith('changed:'))
    .map((tag) => tag.slice('changed:'.length))

  return (
    <section className="panel-card panel-card--details">
      <div className="panel-card__header">
        <h2 className="panel-card__title">{block.title}</h2>
        <span className={`status-badge status-badge--${block.source}`}>
          {block.source === 'draft' ? 'черновик' : block.passed ? 'passed' : 'failed'}
        </span>
      </div>
      <div className="panel-card__body">
        <Info label="test_id" value={block.testId} />
        <Info label="config_name" value={block.configName} />
        <Info label="model_name" value={block.modelName || 'не указана'} />
        <Info label="score" value={typeof block.score === 'number' ? block.score.toFixed(4) : 'нет'} />
        <Info
          label="latency_ms"
          value={typeof block.latencyMs === 'number' ? block.latencyMs.toFixed(2) : 'нет'}
        />
        <Info label="timestamp_utc" value={block.timestampUtc || 'нет'} />
        <Info label="trace_id" value={block.traceId || 'нет'} />
        {block.branchName ? <Info label="branch" value={block.branchName} /> : null}

        {changedFields.length > 0 ? (
          <div className="changed-note">Изменено: {changedFields.join(', ')}</div>
        ) : null}

        <PanelText title="Промпт" value={block.inputText} changed={changedFields.includes('input')} />
        <PanelJson
          title="runtime_params"
          value={block.runtimeParams}
          changed={changedFields.includes('runtime_params')}
        />
        <PanelText title="response_text" value={block.responseText || 'Ответа пока нет.'} />
        <PanelJson title="scoring" value={block.scoring ?? {}} />
        <PanelJson title="raw_response" value={block.rawResponse ?? {}} />
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-card__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PanelText({
  title,
  value,
  changed = false,
}: {
  title: string
  value: string
  changed?: boolean
}) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      <pre className={`panel-pre ${changed ? 'panel-pre--changed' : ''}`}>{value}</pre>
    </section>
  )
}

function PanelJson({
  title,
  value,
  changed = false,
}: {
  title: string
  value: unknown
  changed?: boolean
}) {
  return (
    <details className="panel-section">
      <summary>{title}</summary>
      <pre className={`panel-pre ${changed ? 'panel-pre--changed' : ''}`}>
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  )
}
