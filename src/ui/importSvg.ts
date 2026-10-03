import type { WorkspaceSvg } from 'blockly'
import { createSvgFilePicker } from './svgFilePicker'
import { mountMessageDialog } from './messageDialog'
import { placeNewBlock } from './placeNewBlock'
import type { ImportSvgState } from '../editor/blocks/svg'
import { t } from '../i18n'

// OpenSCADs SVG-Import (nanosvg) versteht nur Pfade/Formen, keine
// <text>-Elemente — die bleiben beim Rendern stillschweigend leer (siehe
// render/worker.ts EMPTY_OBJECT_MESSAGE). Da das von aussen wie "nichts
// passiert" aussieht, hier frueh warnen, statt den Nutzer raten zu lassen.
const SVG_TEXT_ELEMENT = /<text[\s>]/i

/** Verdrahtet den Menuepunkt "SVG importieren…": im Unterschied zu
 *  "Importieren…" (importProject.ts, merged ein GESAMTES Projekt) legt
 *  dieser Menuepunkt bei jeder Dateiwahl einen einzelnen, sofort
 *  einsatzbereiten os_import_svg-Block mit dem gewaehlten Dateiinhalt an. */
export function wireImportSvg(workspace: WorkspaceSvg, triggerBtn: HTMLButtonElement): void {
  const textWarningDialog = mountMessageDialog(
    t('svg_text_warning.title'),
    t('svg_text_warning.message'),
    t('svg_text_warning.close'),
  )

  const pickFile = createSvgFilePicker((svg, filename) => {
    if (SVG_TEXT_ELEMENT.test(svg)) textWarningDialog.open()

    const block = workspace.newBlock('os_import_svg')
    const state: ImportSvgState = { filename, svg }
    block.loadExtraState?.(state)
    block.initSvg()
    block.render()
    placeNewBlock(workspace, block)
  })

  triggerBtn.addEventListener('click', pickFile)
}
