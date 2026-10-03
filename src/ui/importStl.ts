import type { WorkspaceSvg } from 'blockly'
import { createStlFilePicker } from './stlFilePicker'
import { placeNewBlock } from './placeNewBlock'
import type { ImportStlState } from '../editor/blocks/stl'
import { uint8ArrayToBase64 } from '../base64'

/** Verdrahtet den Menuepunkt "STL importieren…" — analog zu
 *  ui/importSvg.ts, aber fuer (meist binaere) STL-Dateien: legt bei jeder
 *  Dateiwahl einen einzelnen, sofort einsatzbereiten os_import_stl-Block
 *  mit dem gewaehlten (Base64-kodierten) Dateiinhalt an. STL ist bereits
 *  fertige 3D-Geometrie — anders als SVG keine "extrudieren"-Warnung noetig. */
export function wireImportStl(workspace: WorkspaceSvg, triggerBtn: HTMLButtonElement): void {
  const pickFile = createStlFilePicker((data, filename) => {
    const block = workspace.newBlock('os_import_stl')
    const state: ImportStlState = { filename, dataBase64: uint8ArrayToBase64(data) }
    block.loadExtraState?.(state)
    block.initSvg()
    block.render()
    placeNewBlock(workspace, block)
  })

  triggerBtn.addEventListener('click', pickFile)
}
