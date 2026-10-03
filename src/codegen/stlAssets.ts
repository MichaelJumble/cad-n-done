import type { Block, Workspace } from 'blockly'
import type { ImportStlState } from '../editor/blocks/stl'
import type { RenderStlAsset } from '../types'
import { assetFilenameFor } from './assetFilename'
import { base64ToUint8Array } from '../base64'

export type { RenderStlAsset as StlAsset } from '../types'

/** Siehe assetFilename.ts — hier fest an die .stl-Endung gebunden. */
export function stlFilenameFor(blockId: string, originalFilename: string): string {
  return assetFilenameFor(blockId, originalFilename, 'stl')
}

// base64ToUint8Array() ist bei grossen Dateien (mehrere zehn MB) ein
// spuerbar teurer, synchroner Hauptthread-Block (siehe base64.ts). Ohne
// diesen Cache wuerde JEDER Render-Zyklus (auch reine Farb-/Sichtbarkeits-
// Aenderungen ohne STL-Bezug) dieselbe Datei erneut komplett dekodieren -
// stlDataBase64_ (Blockly.Block, siehe editor/blocks/stl.ts) bleibt
// referenzgleich, solange der Block nicht neu importiert/geladen wird, daher
// genuegt ein einfacher String-Identitaetsvergleich als Cache-Treffer.
const decodedCache = new WeakMap<Block, { source: string; data: Uint8Array }>()

function decodeCached(block: Block, base64: string): Uint8Array {
  const cached = decodedCache.get(block)
  if (cached && cached.source === base64) return cached.data
  const data = base64ToUint8Array(base64)
  decodedCache.set(block, { source: base64, data })
  return data
}

/** Sammelt den (binaeren) STL-Inhalt aller os_import_stl-Bloecke im
 *  Workspace ein — Gegenstueck zu collectSvgAssets in svgAssets.ts. */
export function collectStlAssets(workspace: Workspace): RenderStlAsset[] {
  const assets: RenderStlAsset[] = []
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type !== 'os_import_stl') continue
    const state = block.saveExtraState?.() as Partial<ImportStlState> | undefined
    if (!state?.dataBase64) continue
    assets.push({
      filename: stlFilenameFor(block.id, state.filename ?? ''),
      data: decodeCached(block, state.dataBase64),
    })
  }
  return assets
}
