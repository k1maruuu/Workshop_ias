import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  BlockCreateMode,
  ExperimentBlock,
  JsonObject,
  TestCaseCreate,
} from '@/types/experiments'

interface ChildBlockDialogProps {
  mode: BlockCreateMode
  parent: ExperimentBlock | null
  open: boolean
  configs: string[]
  defaultConfigName: string
  onClose: () => void
  onSubmit: (test: TestCaseCreate) => Promise<void>
}

export function ChildBlockDialog({
  mode,
  parent,
  open,
  configs,
  defaultConfigName,
  onClose,
  onSubmit,
}: ChildBlockDialogProps) {
  const base = useMemo(() => {
    const now = Date.now().toString(36)

    if (mode === 'child' && parent) {
      return {
        testId: `${parent.testId}_child_${now}`,
        configName: parent.configName,
        branchName: parent.branchName || 'main',
        prompt: parent.inputText,
        runtimeParamsJson: JSON.stringify(parent.runtimeParams ?? {}, null, 2),
        checksJson: JSON.stringify(parent.checks ?? { response_not_empty: true }, null, 2),
        extraTags: 'ui-board',
      }
    }

    return {
      testId: `parent_${now}`,
      configName: defaultConfigName,
      branchName: 'main',
      prompt: [
        'Задача:',
        'Опиши, что именно должен сделать ассистент.',
        '',
        'Контекст:',
        'Добавь входные данные, ограничения и формат ответа.',
        '',
        'Ожидаемый результат:',
        '- Ответ должен быть полезным и проверяемым.',
      ].join('\n'),
      runtimeParamsJson: JSON.stringify({}, null, 2),
      checksJson: JSON.stringify({ response_not_empty: true }, null, 2),
      extraTags: 'ui-board',
    }
  }, [defaultConfigName, mode, parent])

  const [testId, setTestId] = useState(base.testId)
  const [configName, setConfigName] = useState(base.configName)
  const [branchName, setBranchName] = useState(base.branchName)
  const [prompt, setPrompt] = useState(base.prompt)
  const [runtimeParamsJson, setRuntimeParamsJson] = useState(base.runtimeParamsJson)
  const [checksJson, setChecksJson] = useState(base.checksJson)
  const [extraTags, setExtraTags] = useState(base.extraTags)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setTestId(base.testId)
    setConfigName(base.configName)
    setBranchName(base.branchName)
    setPrompt(base.prompt)
    setRuntimeParamsJson(base.runtimeParamsJson)
    setChecksJson(base.checksJson)
    setExtraTags(base.extraTags)
    setFormError(null)
  }, [base, open])

  if (!open) return null
  if (mode === 'child' && !parent) return null

  const changedFields = [
    prompt !== base.prompt ? 'input' : '',
    runtimeParamsJson !== base.runtimeParamsJson ? 'runtime_params' : '',
    checksJson !== base.checksJson ? 'checks' : '',
    branchName !== base.branchName ? 'branch' : '',
    extraTags !== base.extraTags ? 'tags' : '',
    configName !== base.configName ? 'config' : '',
  ].filter(Boolean)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)

    try {
      let runtimeParams: JsonObject
      try {
        const parsed = JSON.parse(runtimeParamsJson)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('runtime_params должен быть JSON-объектом')
        }
        runtimeParams = parsed as JsonObject
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : 'Некорректный JSON в runtime_params',
        )
        return
      }

      let checks: JsonObject
      try {
        const parsed = JSON.parse(checksJson)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('checks должен быть JSON-объектом')
        }
        checks = parsed as JsonObject
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Некорректный JSON в checks')
        return
      }

      const tags = [
        `branch:${branchName.trim() || 'main'}`,
        `board_config:${configName}`,
        ...extraTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...changedFields.map((field) => `changed:${field}`),
      ]

      if (mode === 'child' && parent) {
        tags.push(`parent_test:${parent.testId}`)
        tags.push(`parent_block:${parent.runId}:${parent.configName}:${parent.testId}`)
      }

      await onSubmit({
        id: testId.trim(),
        input: prompt,
        runtime_params: runtimeParams,
        checks,
        tags: [...new Set(tags)],
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog" onSubmit={handleSubmit}>
        <div className="dialog__header">
          <h2 className="dialog__title">
            {mode === 'child' ? 'Создать ребёнка' : 'Создать родителя'}
          </h2>
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="dialog__body">
          {mode === 'child' && parent ? (
            <label className="field">
              Родитель
              <input value={`${parent.configName} / ${parent.testId}`} readOnly />
            </label>
          ) : null}

          <label className="field">
            test_id
            <input
              value={testId}
              onChange={(event) => setTestId(event.target.value)}
              required
              pattern="[A-Za-z0-9_.:-]+"
            />
          </label>

          <label className={`field ${configName !== base.configName ? 'field--changed' : ''}`}>
            config_name
            <select
              value={configName}
              onChange={(event) => setConfigName(event.target.value)}
              disabled={mode === 'child'}
            >
              {(configs.length ? configs : [configName]).map((config) => (
                <option key={config} value={config}>
                  {config}
                </option>
              ))}
            </select>
          </label>

          <label className={`field ${branchName !== base.branchName ? 'field--changed' : ''}`}>
            Ветка
            <input value={branchName} onChange={(event) => setBranchName(event.target.value)} />
          </label>

          <label className={`field ${prompt !== base.prompt ? 'field--changed' : ''}`}>
            Промпт
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
          </label>

          <label
            className={`field ${
              runtimeParamsJson !== base.runtimeParamsJson ? 'field--changed' : ''
            }`}
          >
            runtime_params JSON
            <textarea
              value={runtimeParamsJson}
              onChange={(event) => setRuntimeParamsJson(event.target.value)}
            />
          </label>

          <label className={`field ${checksJson !== base.checksJson ? 'field--changed' : ''}`}>
            checks JSON
            <textarea value={checksJson} onChange={(event) => setChecksJson(event.target.value)} />
          </label>

          <label className={`field ${extraTags !== base.extraTags ? 'field--changed' : ''}`}>
            Дополнительные теги через запятую
            <input value={extraTags} onChange={(event) => setExtraTags(event.target.value)} />
          </label>

          {changedFields.length > 0 ? (
            <div className="changed-note">Изменённые поля подсвечены зелёным.</div>
          ) : null}

          {formError ? <div className="form-error">{formError}</div> : null}
        </div>

        <div className="dialog__footer">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="topbar__button--primary" type="submit" disabled={submitting}>
            Создать
          </button>
        </div>
      </form>
    </div>
  )
}
