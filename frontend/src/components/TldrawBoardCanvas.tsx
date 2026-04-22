'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  createShapeId,
  Editor,
  Tldraw,
  TLArrowBinding,
  TLArrowShape,
  TLShapeId,
  Vec,
  useEditor,
  useValue,
} from 'tldraw'
import {
  EXPERIMENT_CARD_TYPE,
  ExperimentCardShape,
  ExperimentCardShapeUtil,
  isExperimentCardShape,
} from '@/components/ExperimentCardShape'
import {
  EXPERIMENT_CARD_COLLAPSED_HEIGHT,
  EXPERIMENT_CARD_WIDTH,
} from '@/lib/boardConstants'
import type { ExperimentBlock, ExperimentGraph } from '@/types/experiments'

const shapeUtils = [ExperimentCardShapeUtil]

export default function TldrawBoardCanvas({
  graph,
  onSelectionChange,
}: {
  graph: ExperimentGraph
  onSelectionChange: (blockIds: string[]) => void
}) {
  const editorRef = useRef<Editor | null>(null)

  const rebuildCanvas = useCallback((editor: Editor, nextGraph: ExperimentGraph) => {
    const existingShapeIds = [...editor.getCurrentPageShapeIds()]

    editor.run(() => {
      if (existingShapeIds.length > 0) {
        editor.deleteShapes(existingShapeIds)
      }

      const shapeIdByBlockId = new Map<string, TLShapeId>()
      const cardShapes = nextGraph.positionedBlocks.map((block) => {
        const shapeId = createShapeId(stableId(`card:${block.id}`))
        shapeIdByBlockId.set(block.id, shapeId)

        return {
          id: shapeId,
          type: EXPERIMENT_CARD_TYPE,
          x: block.x,
          y: block.y,
          props: blockToShapeProps(block),
        } satisfies Partial<ExperimentCardShape> & {
          id: TLShapeId
          type: typeof EXPERIMENT_CARD_TYPE
        }
      })

      editor.createShapes(cardShapes)

      for (const edge of nextGraph.edges) {
        const parentShapeId = shapeIdByBlockId.get(edge.parentId)
        const childShapeId = shapeIdByBlockId.get(edge.childId)

        if (parentShapeId && childShapeId) {
          createArrowBetweenShapes(editor, parentShapeId, childShapeId, stableId(`arrow:${edge.id}`))
        }
      }
    })

    const bounds = editor.getCurrentPageBounds()
    if (bounds) {
      editor.zoomToBounds(bounds, {
        animation: { duration: 0 },
        inset: 80,
      })
    }
  }, [])

  useEffect(() => {
    if (editorRef.current) {
      rebuildCanvas(editorRef.current, graph)
    }
  }, [graph, rebuildCanvas])

  return (
    <Tldraw
      shapeUtils={shapeUtils}
      onMount={(editor) => {
        editorRef.current = editor
        rebuildCanvas(editor, graph)
      }}
    >
      <SelectionBridge onSelectionChange={onSelectionChange} />
    </Tldraw>
  )
}

function SelectionBridge({
  onSelectionChange,
}: {
  onSelectionChange: (blockIds: string[]) => void
}) {
  const editor = useEditor()
  const selectedShapeIds = useValue(
    'selected experiment shapes',
    () => editor.getSelectedShapeIds().join(','),
    [editor],
  )

  useEffect(() => {
    const blockIds = editor
      .getSelectedShapes()
      .filter(isExperimentCardShape)
      .map((shape) => shape.props.blockId)
    onSelectionChange(blockIds)
  }, [editor, onSelectionChange, selectedShapeIds])

  return null
}

function blockToShapeProps(block: ExperimentBlock): ExperimentCardShape['props'] {
  return {
    w: EXPERIMENT_CARD_WIDTH,
    h: EXPERIMENT_CARD_COLLAPSED_HEIGHT,
    blockId: block.id,
    source: block.source,
    title: block.title,
    runId: block.runId,
    configName: block.configName,
    testId: block.testId,
    prompt: block.inputText,
    modelName: block.modelName ?? '',
    runtimeParamsJson: JSON.stringify(block.runtimeParams ?? {}, null, 2),
    scoreText: typeof block.score === 'number' ? block.score.toFixed(4) : '',
    passedText:
      typeof block.passed === 'boolean' ? (block.passed ? 'passed' : 'failed') : 'нет результата',
    passedStatus: block.passed === true ? 'pass' : block.passed === false ? 'fail' : 'unknown',
    latencyText: typeof block.latencyMs === 'number' ? block.latencyMs.toFixed(2) : '',
    timestampText: block.timestampUtc ?? '',
    traceId: block.traceId ?? '',
    responseText: block.responseText ?? '',
    scoringJson: JSON.stringify(block.scoring ?? {}, null, 2),
    rawResponseJson: JSON.stringify(block.rawResponse ?? {}, null, 2),
    branchName: block.branchName ?? '',
    changedFields: block.tags
      .filter((tag) => tag.startsWith('changed:'))
      .map((tag) => tag.slice('changed:'.length))
      .join(','),
    expanded: false,
  }
}

function stableId(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  return `experiment_${hash.toString(16)}`
}

function createArrowBetweenShapes(
  editor: Editor,
  startShapeId: TLShapeId,
  endShapeId: TLShapeId,
  stableSuffix: string,
  options = {} as {
    start?: Partial<Omit<TLArrowBinding['props'], 'terminal'>>
    end?: Partial<Omit<TLArrowBinding['props'], 'terminal'>>
  },
) {
  const { start = {}, end = {} } = options
  const {
    normalizedAnchor: startNormalizedAnchor = { x: 0.5, y: 1 },
    isExact: startIsExact = false,
    isPrecise: startIsPrecise = true,
  } = start
  const {
    normalizedAnchor: endNormalizedAnchor = { x: 0.5, y: 0 },
    isExact: endIsExact = false,
    isPrecise: endIsPrecise = true,
  } = end

  const startBounds = editor.getShapePageBounds(startShapeId)
  const endBounds = editor.getShapePageBounds(endShapeId)
  if (!startBounds || !endBounds) return

  const startPoint = Vec.Add(startBounds.point, Vec.MulV(startBounds.size, Vec.From(startNormalizedAnchor)))
  const endPoint = Vec.Add(endBounds.point, Vec.MulV(endBounds.size, Vec.From(endNormalizedAnchor)))
  const arrowOrigin = Vec.Min(startPoint, endPoint)
  const arrowId = createShapeId(stableSuffix)

  editor.createShape<TLArrowShape>({
    id: arrowId,
    type: 'arrow',
    x: arrowOrigin.x,
    y: arrowOrigin.y,
    props: {
      start: {
        x: startPoint.x - arrowOrigin.x,
        y: startPoint.y - arrowOrigin.y,
      },
      end: {
        x: endPoint.x - arrowOrigin.x,
        y: endPoint.y - arrowOrigin.y,
      },
      color: 'orange',
      size: 'm',
      arrowheadEnd: 'arrow',
    },
  })

  editor.createBindings([
    {
      fromId: arrowId,
      toId: startShapeId,
      type: 'arrow',
      props: {
        terminal: 'start',
        normalizedAnchor: startNormalizedAnchor,
        isExact: startIsExact,
        isPrecise: startIsPrecise,
      },
    },
    {
      fromId: arrowId,
      toId: endShapeId,
      type: 'arrow',
      props: {
        terminal: 'end',
        normalizedAnchor: endNormalizedAnchor,
        isExact: endIsExact,
        isPrecise: endIsPrecise,
      },
    },
  ])
}
