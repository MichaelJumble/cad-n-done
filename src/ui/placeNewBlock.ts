import type { BlockSvg, WorkspaceSvg } from 'blockly'

/** Kaskaden-Offset (damit mehrere Importe nicht exakt uebereinanderliegen),
 *  dann ins Bild scrollen und selektieren, damit ein frisch erzeugter
 *  "Import-artiger" Block (os_import_svg, os_import_stl, os_trace_photo, ...)
 *  sofort sichtbar/auffindbar ist. Aus wireImportSvg/wireImportStl
 *  herausgezogen, damit ui/tracePhotoDialog.ts dasselbe Platzierungsverhalten
 *  nutzt statt es zu duplizieren. */
export function placeNewBlock(workspace: WorkspaceSvg, block: BlockSvg): void {
  const offset = 20 * workspace.getTopBlocks(false).length
  block.moveBy(offset, offset)
  workspace.centerOnBlock(block.id)
  block.select()
}
