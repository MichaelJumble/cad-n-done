import type {
  RenderCodeFragment,
  RenderRequest,
  RenderResult,
  RenderProgress,
  RenderSvgAsset,
  RenderStlAsset,
} from '../types'

export type RenderProgressCallback = (index: number, total: number, color: string | null) => void

export interface RenderClient {
  render(
    fragments: RenderCodeFragment[],
    svgAssets: RenderSvgAsset[],
    stlAssets: RenderStlAsset[],
    onProgress?: RenderProgressCallback,
  ): Promise<RenderResult>
  dispose(): void
}

let requestCounter = 0

/** Startet den Render-Worker und liefert eine Promise-basierte API dafuer. */
export function createRenderClient(): RenderClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<string, (result: RenderResult) => void>()
  const pendingProgress = new Map<string, RenderProgressCallback>()

  worker.onmessage = (event: MessageEvent<RenderResult | RenderProgress>) => {
    const data = event.data
    if ('kind' in data && data.kind === 'progress') {
      pendingProgress.get(data.requestId)?.(data.index, data.total, data.color)
      return
    }
    const result = data as RenderResult
    const resolve = pending.get(result.requestId)
    if (!resolve) return
    pending.delete(result.requestId)
    pendingProgress.delete(result.requestId)
    resolve(result)
  }

  worker.onerror = (event: ErrorEvent) => {
    for (const [requestId, resolve] of pending) {
      resolve({ requestId, status: 'error', message: event.message })
    }
    pending.clear()
    pendingProgress.clear()
  }

  return {
    render(
      fragments: RenderCodeFragment[],
      svgAssets: RenderSvgAsset[],
      stlAssets: RenderStlAsset[],
      onProgress?: RenderProgressCallback,
    ): Promise<RenderResult> {
      const requestId = `render-${++requestCounter}`
      return new Promise((resolve) => {
        pending.set(requestId, resolve)
        if (onProgress) pendingProgress.set(requestId, onProgress)
        const request: RenderRequest = { requestId, fragments, svgAssets, stlAssets }
        worker.postMessage(request)
      })
    },
    dispose(): void {
      worker.terminate()
      pending.clear()
      pendingProgress.clear()
    },
  }
}
