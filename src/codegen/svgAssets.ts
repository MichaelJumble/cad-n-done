import type { Workspace } from 'blockly'
import type { ImportSvgState } from '../editor/blocks/svg'
import type { TracePhotoState } from '../editor/blocks/tracePhoto'
import { tracePhotoToSvgMarkup } from '../editor/blocks/tracePhoto'
import type { RenderSvgAsset } from '../types'
import { assetFilenameFor } from './assetFilename'

export type { RenderSvgAsset as SvgAsset } from '../types'

/** Siehe assetFilename.ts — hier fest an die .svg-Endung gebunden. */
export function svgFilenameFor(blockId: string, originalFilename: string): string {
  return assetFilenameFor(blockId, originalFilename, 'svg')
}

/** Wie svgFilenameFor, aber fuer os_trace_photo-Bloecke - die haben keinen
 *  vom Nutzer gewaehlten Original-Dateinamen (nur ein hochgeladenes Foto),
 *  daher ein fester Basisname statt state.filename. */
export function tracePhotoFilenameFor(blockId: string): string {
  return assetFilenameFor(blockId, 'trace_photo', 'svg')
}

/** Sammelt den SVG-Inhalt aller os_import_svg- UND os_trace_photo-Bloecke im
 *  Workspace ein (unabhaengig davon, ob sie gerade in einem gerenderten
 *  Fragment stecken — siehe colorFragments.ts fuer die Vereinfachung, dass
 *  jede Fragment-Instanz alle Assets bekommt). Bewusst EIN Collector fuer
 *  beide Blocktypen (statt eines zweiten collectTracePhotoAssets): beide
 *  liefern dieselbe RenderSvgAsset-Form und werden an denselben Stellen
 *  (codePanel.ts/viewerPanel.ts) konsumiert - ein zweiter Collector koennte
 *  an einer zukuenftigen 5. Aufrufstelle vergessen werden, ein Zweig in
 *  derselben Schleife nicht. os_trace_photo hat keinen vorab gespeicherten
 *  SVG-String, sondern leitet ihn live aus den editierbaren Punkten ab
 *  (tracePhotoToSvgMarkup) - Live-Vorschau im Dialog und dieser Export
 *  nutzen dieselbe tracePathData()-Funktion und koennen so nie auseinanderlaufen. */
export function collectSvgAssets(workspace: Workspace): RenderSvgAsset[] {
  const assets: RenderSvgAsset[] = []
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type === 'os_import_svg') {
      const state = block.saveExtraState?.() as Partial<ImportSvgState> | undefined
      if (!state?.svg) continue
      assets.push({ filename: svgFilenameFor(block.id, state.filename ?? ''), svg: state.svg })
    } else if (block.type === 'os_trace_photo') {
      const state = block.saveExtraState?.() as Partial<TracePhotoState> | undefined
      if (!state?.points?.length) continue
      assets.push({
        filename: tracePhotoFilenameFor(block.id),
        svg: tracePhotoToSvgMarkup(state as TracePhotoState),
      })
    }
  }
  return assets
}
