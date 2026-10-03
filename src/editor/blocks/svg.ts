import * as Blockly from 'blockly'
import type { BlockDefinition } from './types'
import { PRIMITIVE_2D_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { centeredOptions, registerNumberShadows } from './blockHelpers'
import { t } from '../../i18n'

const STATE_EXTENSION = 'os_import_svg_state'

/** Traegt den eigentlichen SVG-Dateiinhalt (typischerweise mehrere KB Text —
 *  zu lang fuer ein normales Editier-Feld) als internen Block-Zustand statt
 *  als sichtbares Feld. Wird ueber saveExtraState/loadExtraState transportiert
 *  (dasselbe Muster wie der "+"/"−"-Mutator in operandButtons.ts) und dadurch
 *  automatisch von Blockly.serialization.workspaces.save/load sowie vom
 *  Projekt-Import-Merge (Blockly.serialization.blocks.append, siehe
 *  ui/importProject.ts) mit durchgereicht — kein Zusatzaufwand fuer
 *  Speichern/Laden/Importieren noetig. */
export interface ImportSvgState {
  filename: string
  svg: string
}

interface ImportSvgBlock extends Blockly.Block {
  svgFilename_: string
  svgContent_: string
}

function registerImportSvgState(): void {
  if (Blockly.Extensions.isRegistered(STATE_EXTENSION)) return
  Blockly.Extensions.register(STATE_EXTENSION, function (this: ImportSvgBlock) {
    this.svgFilename_ = ''
    this.svgContent_ = ''
    this.saveExtraState = (): ImportSvgState => ({
      filename: this.svgFilename_,
      svg: this.svgContent_,
    })
    this.loadExtraState = (state: Partial<ImportSvgState>): void => {
      this.svgFilename_ = state.filename ?? ''
      this.svgContent_ = state.svg ?? ''
      this.setFieldValue(this.svgFilename_ || '—', 'FILENAME')
    }
  })
}

/** 2D-Formen: SVG-Import. Wird NICHT ueber die Toolbox-Flyout erzeugt (ein
 *  dort herausgezogener Block haette keinen Dateiinhalt), sondern
 *  ausschliesslich ueber den Menuepunkt "SVG importieren…" (siehe
 *  ui/importSvg.ts), der einen frischen Block direkt mit Inhalt anlegt. */
export function svgBlocks(): BlockDefinition[] {
  registerImportSvgState()
  registerNumberShadows('os_import_svg_defaults', { DPI: 96 })

  return [
    {
      type: 'os_import_svg',
      message0: t('block.import_svg.message0'),
      args0: [
        { type: 'field_label_serializable', name: 'FILENAME', text: '—' },
        { type: 'input_value', name: 'DPI', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_2D_COLOUR,
      tooltip: t('block.import_svg.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_import_svg_defaults'],
      mutator: STATE_EXTENSION,
    },
  ]
}
