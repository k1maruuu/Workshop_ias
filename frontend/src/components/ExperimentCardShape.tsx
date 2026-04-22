import {
  Geometry2d,
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  TLBaseShape,
  TLShape,
  type RecordProps,
} from 'tldraw'
import type { MouseEvent } from 'react'
import {
  EXPERIMENT_CARD_COLLAPSED_HEIGHT,
  EXPERIMENT_CARD_EXPANDED_HEIGHT,
  EXPERIMENT_CARD_WIDTH,
} from '@/lib/boardConstants'

export const EXPERIMENT_CARD_TYPE = 'experiment-card'

export interface ExperimentCardShapeProps {
  w: number
  h: number
  blockId: string
  source: 'result' | 'draft'
  title: string
  runId: string
  configName: string
  testId: string
  prompt: string
  modelName: string
  runtimeParamsJson: string
  scoreText: string
  passedText: string
  passedStatus: 'pass' | 'fail' | 'unknown'
  latencyText: string
  timestampText: string
  traceId: string
  responseText: string
  scoringJson: string
  rawResponseJson: string
  branchName: string
  changedFields: string
  expanded: boolean
}

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [EXPERIMENT_CARD_TYPE]: ExperimentCardShapeProps
  }
}

export type ExperimentCardShape = TLBaseShape<
  typeof EXPERIMENT_CARD_TYPE,
  ExperimentCardShapeProps
>

export function isExperimentCardShape(shape: TLShape | undefined): shape is ExperimentCardShape {
  return shape?.type === EXPERIMENT_CARD_TYPE
}

export class ExperimentCardShapeUtil extends ShapeUtil<ExperimentCardShape> {
  static override type = EXPERIMENT_CARD_TYPE

  static override props: RecordProps<ExperimentCardShape> = {
    w: T.number,
    h: T.number,
    blockId: T.string,
    source: T.literalEnum('result', 'draft'),
    title: T.string,
    runId: T.string,
    configName: T.string,
    testId: T.string,
    prompt: T.string,
    modelName: T.string,
    runtimeParamsJson: T.string,
    scoreText: T.string,
    passedText: T.string,
    passedStatus: T.literalEnum('pass', 'fail', 'unknown'),
    latencyText: T.string,
    timestampText: T.string,
    traceId: T.string,
    responseText: T.string,
    scoringJson: T.string,
    rawResponseJson: T.string,
    branchName: T.string,
    changedFields: T.string,
    expanded: T.boolean,
  }

  override canEdit() {
    return false
  }

  override canResize() {
    return false
  }

  override canBind() {
    return true
  }

  getDefaultProps(): ExperimentCardShape['props'] {
    return {
      w: EXPERIMENT_CARD_WIDTH,
      h: EXPERIMENT_CARD_COLLAPSED_HEIGHT,
      blockId: '',
      source: 'result',
      title: 'Эксперимент',
      runId: '',
      configName: '',
      testId: '',
      prompt: '',
      modelName: '',
      runtimeParamsJson: '{}',
      scoreText: '',
      passedText: '',
      passedStatus: 'unknown',
      latencyText: '',
      timestampText: '',
      traceId: '',
      responseText: '',
      scoringJson: '{}',
      rawResponseJson: '{}',
      branchName: '',
      changedFields: '',
      expanded: false,
    }
  }

  getGeometry(shape: ExperimentCardShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  component(shape: ExperimentCardShape) {
    const props = shape.props
    const isDraft = props.source === 'draft'
    const changedFields = props.changedFields
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const runtimeParams = toParamEntries(props.runtimeParamsJson)
    const visibleRuntimeParams = props.expanded ? runtimeParams : runtimeParams.slice(0, 8)

    const toggleExpanded = (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const expanded = !props.expanded
      this.editor.select(shape.id)
      this.editor.updateShape<ExperimentCardShape>({
        id: shape.id,
        type: EXPERIMENT_CARD_TYPE,
        props: {
          expanded,
          h: expanded ? EXPERIMENT_CARD_EXPANDED_HEIGHT : EXPERIMENT_CARD_COLLAPSED_HEIGHT,
        },
      })
    }

    return (
      <HTMLContainer
        className={`experiment-card-shape${isDraft ? ' experiment-card-shape--draft' : ''}${
          props.expanded ? ' experiment-card-shape--expanded' : ''
        }`}
        style={{ width: props.w, height: props.h }}
      >
        <div className="experiment-card__header">
          <div className="experiment-card__title-row">
            <h2 className="experiment-card__title">{props.title}</h2>
            <span
              className={`experiment-card__badge ${
                isDraft
                  ? 'experiment-card__badge--draft'
                  : `experiment-card__badge--${props.passedStatus}`
              }`}
            >
              {isDraft ? 'черновик' : props.passedText}
            </span>
          </div>
          <div className="experiment-card__meta">
            <span>{props.testId}</span>
            {props.branchName ? <span>ветка: {props.branchName}</span> : null}
          </div>
        </div>

        <div className="experiment-card__body" onWheel={(event) => event.stopPropagation()}>
          <div className="experiment-card__meta">
            <span>{props.configName}</span>
            <span>{props.modelName || 'модель не указана'}</span>
          </div>

          <section className="experiment-card__section experiment-card__section--prompt">
            <div className="experiment-card__section-title">Промпт</div>
            <p
              className={`experiment-card__text ${
                changedFields.includes('input') ? 'experiment-card__text--changed' : ''
              }`}
            >
              {props.prompt || 'Промпт пока пустой.'}
            </p>
          </section>

          <section
            className={`experiment-card__section ${
              changedFields.includes('runtime_params') ? 'experiment-card__section--changed' : ''
            }`}
          >
            <div className="experiment-card__section-title">Параметры запуска</div>
            <div className="experiment-card__params">
              {visibleRuntimeParams.length > 0 ? (
                visibleRuntimeParams.map(([key, value]) => (
                  <ParamField key={key} label={key} value={value} />
                ))
              ) : (
                <div className="experiment-card__empty">параметров нет</div>
              )}
              {!props.expanded && runtimeParams.length > visibleRuntimeParams.length ? (
                <div className="experiment-card__empty">
                  ещё {runtimeParams.length - visibleRuntimeParams.length}
                </div>
              ) : null}
            </div>
          </section>

          <div className="experiment-card__stats">
            <Field label="score" value={props.scoreText || 'нет'} />
            <Field label="latency" value={props.latencyText ? `${props.latencyText} ms` : 'нет'} />
          </div>

          {changedFields.length > 0 ? (
            <div className="experiment-card__changed">изменено: {changedFields.join(', ')}</div>
          ) : null}

          {props.expanded ? (
            <div className="experiment-card__expanded">
              <div className="experiment-card__grid">
                <Field label="timestamp_utc" value={props.timestampText || 'нет'} />
                <Field label="trace_id" value={props.traceId || 'нет'} />
              </div>

              <section className="experiment-card__section">
                <div className="experiment-card__section-title">Ответ</div>
                <pre className="experiment-card__pre">
                  {props.responseText || 'Ответа пока нет.'}
                </pre>
              </section>

              <details className="experiment-card__details">
                <summary>scoring JSON</summary>
                <pre className="experiment-card__pre">{props.scoringJson}</pre>
              </details>

              <details className="experiment-card__details">
                <summary>raw_response JSON</summary>
                <pre className="experiment-card__pre">{props.rawResponseJson}</pre>
              </details>
            </div>
          ) : null}

          <button className="experiment-card__button" type="button" onClick={toggleExpanded}>
            {props.expanded ? 'Свернуть' : 'Раскрыть'}
          </button>
        </div>
      </HTMLContainer>
    )
  }

  indicator(shape: ExperimentCardShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} />
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="experiment-card__field">
      <span>{label}</span>
      <strong className="experiment-card__value">{value}</strong>
    </div>
  )
}

function ParamField({ label, value }: { label: string; value: string }) {
  return (
    <div className="experiment-card__param">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function toParamEntries(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []

    return Object.entries(parsed).map(([key, item]) => [
      key,
      typeof item === 'string' ? item : JSON.stringify(item),
    ] as [string, string])
  } catch {
    return []
  }
}
