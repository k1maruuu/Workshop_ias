import {
  EXPERIMENT_CARD_COLLAPSED_HEIGHT,
  EXPERIMENT_CARD_GAP_X,
  EXPERIMENT_CARD_GAP_Y,
  EXPERIMENT_CARD_WIDTH,
} from '@/lib/boardConstants'
import type {
  ExperimentBlock,
  ExperimentEdge,
  ExperimentGraph,
  ExperimentResult,
  JsonObject,
  ParsedTags,
  PositionedBlock,
  TestCase,
} from '@/types/experiments'

export function blockKey(runId: string, configName: string, testId: string) {
  return `${runId}:${configName}:${testId}`
}

export function draftBlockKey(parentBlockId: string, testId: string) {
  return `draft:${parentBlockId}:${testId}`
}

export function humanizeId(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase())
}

export function parseTags(tags: string[] = []): ParsedTags {
  const parentTestIds: string[] = []
  const parentBlocks: ParsedTags['parentBlocks'] = []
  const ordinaryTags: string[] = []
  let branchName: string | undefined
  let boardConfigName: string | undefined

  for (const tag of tags) {
    if (tag.startsWith('parent_test:')) {
      const parentTestId = tag.slice('parent_test:'.length).trim()
      if (parentTestId) parentTestIds.push(parentTestId)
      continue
    }

    if (tag.startsWith('parent_block:')) {
      const raw = tag.slice('parent_block:'.length)
      const [runId, configName, ...testParts] = raw.split(':')
      const testId = testParts.join(':')

      if (runId && configName && testId) {
        parentBlocks.push({
          runId,
          configName,
          testId,
          blockId: blockKey(runId, configName, testId),
        })
      }
      continue
    }

    if (tag.startsWith('branch:')) {
      branchName = tag.slice('branch:'.length).trim() || undefined
      continue
    }

    if (tag.startsWith('board_config:')) {
      boardConfigName = tag.slice('board_config:'.length).trim() || undefined
      continue
    }

    ordinaryTags.push(tag)
  }

  return { parentTestIds, parentBlocks, branchName, boardConfigName, ordinaryTags }
}

export function resolveBaseConfigName(configName: string, catalogConfigs: string[]) {
  if (catalogConfigs.includes(configName)) return configName

  const modelSeparatorIndex = configName.indexOf('__')
  if (modelSeparatorIndex > 0) {
    const baseName = configName.slice(0, modelSeparatorIndex)
    if (catalogConfigs.includes(baseName)) return baseName
  }

  return configName
}

export function shouldUseExplicitModel(configName: string, catalogConfigs: string[]) {
  return !catalogConfigs.includes(configName) && configName.includes('__')
}

function matchesParentRef(block: ExperimentBlock, parsed: ParsedTags) {
  if (parsed.parentBlocks.length > 0) {
    return parsed.parentBlocks.some(
      (ref) =>
        ref.runId === block.runId &&
        ref.configName === block.configName &&
        ref.testId === block.testId,
    )
  }

  return parsed.parentTestIds.includes(block.testId)
}

export function buildExperimentGraph({
  results,
  tests,
  fallbackRunId,
  fallbackConfigName,
}: {
  results: ExperimentResult[]
  tests: TestCase[]
  fallbackRunId?: string
  fallbackConfigName?: string
}): ExperimentGraph {
  const testById = new Map(tests.map((test) => [test.id, test]))
  const blockById = new Map<string, ExperimentBlock>()
  const resultTestIds = new Set<string>()

  for (const result of results) {
    const test = testById.get(result.test_id)
    const parsed = parseTags(test?.tags ?? [])
    const id = blockKey(result.experiment_run_id, result.config_name, result.test_id)
    resultTestIds.add(result.test_id)

    blockById.set(id, {
      id,
      source: 'result',
      runId: result.experiment_run_id,
      configName: result.config_name,
      testId: result.test_id,
      title: humanizeId(result.test_id),
      inputText: result.input_text,
      responseText: result.response_text,
      modelName: result.model_name,
      runtimeParams: result.runtime_params ?? {},
      score: result.score,
      passed: result.passed,
      latencyMs: result.latency_ms,
      timestampUtc: result.timestamp_utc,
      traceId: result.trace_id,
      rawResponse: result.raw_response,
      scoring: result.scoring,
      tags: test?.tags ?? [],
      branchName: parsed.branchName,
      checks: test?.checks,
    })
  }

  const resultBlocks = [...blockById.values()]

  for (const block of resultBlocks) {
    const parentId = resolveParentBlockId(block, resultBlocks)
    if (parentId && parentId !== block.id) {
      block.parentBlockId = parentId
    }
  }

  for (const test of tests) {
    const parsed = parseTags(test.tags)
    if (parsed.parentBlocks.length === 0 && parsed.parentTestIds.length === 0) continue

    const parentBlocks = resultBlocks.filter((block) => matchesParentRef(block, parsed))

    for (const parent of parentBlocks) {
      const concreteResultId = blockKey(parent.runId, parent.configName, test.id)
      if (blockById.has(concreteResultId)) continue

      const draftId = draftBlockKey(parent.id, test.id)
      if (blockById.has(draftId)) continue

      blockById.set(draftId, {
        id: draftId,
        source: 'draft',
        runId: parent.runId,
        configName: parent.configName,
        testId: test.id,
        title: humanizeId(test.id),
        inputText: test.input,
        responseText: '',
        modelName: parent.modelName,
        runtimeParams: test.runtime_params ?? parent.runtimeParams,
        tags: test.tags,
        branchName: parsed.branchName,
        parentBlockId: parent.id,
        checks: test.checks,
      })
    }
  }

  for (const test of tests) {
    if (!test.tags.includes('ui-board') || resultTestIds.has(test.id)) continue

    const parsed = parseTags(test.tags)
    if (parsed.parentBlocks.length > 0 || parsed.parentTestIds.length > 0) continue

    const runId = fallbackRunId || results[0]?.experiment_run_id || 'draft-run'
    const configName = parsed.boardConfigName || fallbackConfigName || results[0]?.config_name || 'draft_config'
    const draftId = draftBlockKey(`root:${runId}:${configName}`, test.id)

    if (!blockById.has(draftId)) {
      blockById.set(draftId, {
        id: draftId,
        source: 'draft',
        runId,
        configName,
        testId: test.id,
        title: humanizeId(test.id),
        inputText: test.input,
        responseText: '',
        runtimeParams: test.runtime_params ?? {},
        tags: test.tags,
        branchName: parsed.branchName,
        checks: test.checks,
      })
    }
  }

  for (const test of tests) {
    if (!test.tags.includes('ui-board')) continue

    const parsed = parseTags(test.tags)
    if (parsed.parentBlocks.length === 0 && parsed.parentTestIds.length === 0) continue

    const parentBlocks = [...blockById.values()].filter((block) => matchesParentRef(block, parsed))

    for (const parent of parentBlocks) {
      const concreteResultId = blockKey(parent.runId, parent.configName, test.id)
      if (blockById.has(concreteResultId)) continue

      const draftId = draftBlockKey(parent.id, test.id)
      if (blockById.has(draftId)) continue

      blockById.set(draftId, {
        id: draftId,
        source: 'draft',
        runId: parent.runId,
        configName: parent.configName,
        testId: test.id,
        title: humanizeId(test.id),
        inputText: test.input,
        responseText: '',
        modelName: parent.modelName,
        runtimeParams: test.runtime_params ?? parent.runtimeParams,
        tags: test.tags,
        branchName: parsed.branchName,
        parentBlockId: parent.id,
        checks: test.checks,
      })
    }
  }

  const blocks = [...blockById.values()].sort(compareBlocks)
  const childrenByParent = new Map<string, ExperimentBlock[]>()

  for (const block of blocks) {
    if (!block.parentBlockId) continue
    const children = childrenByParent.get(block.parentBlockId) ?? []
    children.push(block)
    childrenByParent.set(block.parentBlockId, children)
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareBlocks)
  }

  const positionedBlocks = layoutBlocks(blocks, childrenByParent)
  const positionedIds = new Set(positionedBlocks.map((block) => block.id))
  const edges: ExperimentEdge[] = blocks
    .filter((block) => block.parentBlockId && positionedIds.has(block.parentBlockId))
    .map((block) => ({
      id: `${block.parentBlockId}->${block.id}`,
      parentId: block.parentBlockId as string,
      childId: block.id,
    }))

  return {
    blocks,
    positionedBlocks,
    edges,
    childrenByParent,
    blockById,
  }
}

function resolveParentBlockId(block: ExperimentBlock, candidates: ExperimentBlock[]) {
  const parsed = parseTags(block.tags)

  for (const ref of parsed.parentBlocks) {
    const exact = candidates.find((candidate) => candidate.id === ref.blockId)
    if (exact) return exact.id
  }

  for (const parentTestId of parsed.parentTestIds) {
    const sameConfig = candidates.find(
      (candidate) =>
        candidate.runId === block.runId &&
        candidate.configName === block.configName &&
        candidate.testId === parentTestId,
    )
    if (sameConfig) return sameConfig.id

    const sameRun = candidates.find(
      (candidate) => candidate.runId === block.runId && candidate.testId === parentTestId,
    )
    if (sameRun) return sameRun.id
  }

  return undefined
}

function layoutBlocks(
  blocks: ExperimentBlock[],
  childrenByParent: Map<string, ExperimentBlock[]>,
): PositionedBlock[] {
  const positions = new Map<string, { x: number; y: number }>()
  const configs = [...new Set(blocks.map((block) => block.configName))].sort()
  let globalY = 0

  for (const configName of configs) {
    const group = blocks.filter((block) => block.configName === configName)
    const groupIds = new Set(group.map((block) => block.id))
    const roots = group
      .filter((block) => !block.parentBlockId || !groupIds.has(block.parentBlockId))
      .sort(compareBlocks)

    const pitchX = EXPERIMENT_CARD_WIDTH + EXPERIMENT_CARD_GAP_X
    const pitchY = EXPERIMENT_CARD_COLLAPSED_HEIGHT + EXPERIMENT_CARD_GAP_Y
    let leafCursor = 0
    let maxDepth = 0
    const visiting = new Set<string>()

    const measure = (block: ExperimentBlock, depth: number): number => {
      if (visiting.has(block.id)) return leafCursor++
      visiting.add(block.id)
      maxDepth = Math.max(maxDepth, depth)

      const children = (childrenByParent.get(block.id) ?? [])
        .filter((child) => groupIds.has(child.id))
        .sort(compareBlocks)

      let leafIndex: number
      if (children.length === 0) {
        leafIndex = leafCursor
        leafCursor += 1
      } else {
        const childIndexes = children.map((child) => measure(child, depth + 1))
        leafIndex = (Math.min(...childIndexes) + Math.max(...childIndexes)) / 2
      }

      positions.set(block.id, {
        x: leafIndex * pitchX,
        y: globalY + depth * pitchY,
      })
      visiting.delete(block.id)
      return leafIndex
    }

    roots.forEach((root) => measure(root, 0))

    for (const block of group) {
      if (!positions.has(block.id)) {
        measure(block, 0)
      }
    }

    globalY += (maxDepth + 1) * pitchY + 180
  }

  return blocks.map((block) => ({
    ...block,
    ...(positions.get(block.id) ?? { x: 0, y: 0 }),
  }))
}

function compareBlocks(left: ExperimentBlock, right: ExperimentBlock) {
  return (
    left.configName.localeCompare(right.configName) ||
    (left.branchName ?? '').localeCompare(right.branchName ?? '') ||
    left.testId.localeCompare(right.testId) ||
    left.id.localeCompare(right.id)
  )
}

export function collectBranchBlocks(graph: ExperimentGraph, rootBlockIds: string[]) {
  const result = new Map<string, ExperimentBlock>()
  const visit = (blockId: string) => {
    const block = graph.blockById.get(blockId)
    if (!block || result.has(blockId)) return

    result.set(blockId, block)
    for (const child of graph.childrenByParent.get(blockId) ?? []) {
      visit(child.id)
    }
  }

  rootBlockIds.forEach(visit)
  return [...result.values()]
}

export function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as JsonObject
}
