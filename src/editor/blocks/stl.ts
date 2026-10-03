import * as Blockly from 'blockly'
import type { BlockDefinition } from './types'
import { PRIMITIVE_3D_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { centeredOptions, registerNumberShadows } from './blockHelpers'
import { t } from '../../i18n'

const STATE_EXTENSION = 'os_import_stl_state'

/** Traegt den eigentlichen (binaeren) STL-Dateiinhalt als internen
 *  Block-Zustand statt als sichtbares Feld — Base64-kodiert, da Blocklys
 *  Serialisierung JSON-basiert ist und keine rohen Binaerdaten kennt (siehe
 *  base64.ts). Gleiches saveExtraState/loadExtraState-Muster wie bei
 *  os_import_svg (editor/blocks/svg.ts). */
export interface ImportStlState {
  filename: string
  dataBase64: string
}

interface ImportStlBlock extends Blockly.Block {
  stlFilename_: string
  stlDataBase64_: string
}

function registerImportStlState(): void {
  if (Blockly.Extensions.isRegistered(STATE_EXTENSION)) return
  Blockly.Extensions.register(STATE_EXTENSION, function (this: ImportStlBlock) {
    this.stlFilename_ = ''
    this.stlDataBase64_ = ''
    this.saveExtraState = (): ImportStlState => ({
      filename: this.stlFilename_,
      dataBase64: this.stlDataBase64_,
    })
    this.loadExtraState = (state: Partial<ImportStlState>): void => {
      this.stlFilename_ = state.filename ?? ''
      this.stlDataBase64_ = state.dataBase64 ?? ''
      this.setFieldValue(this.stlFilename_ || '—', 'FILENAME')
    }
  })
}

/** 3D-Formen: STL-Import. Wie os_import_svg NICHT ueber die Toolbox-Flyout
 *  erzeugt (ein dort herausgezogener Block haette keinen Dateiinhalt),
 *  sondern ausschliesslich ueber den Menuepunkt "STL importieren…" (siehe
 *  ui/importStl.ts). Anders als SVG bereits fertige 3D-Geometrie — keine
 *  Extrusion noetig, direkt mit anderen 3D-Bloecken kombinierbar. */
export function stlBlocks(): BlockDefinition[] {
  registerImportStlState()
  registerNumberShadows('os_import_stl_defaults', { CONVEXITY: 10 })

  return [
    {
      type: 'os_import_stl',
      message0: t('block.import_stl.message0'),
      args0: [
        { type: 'field_label_serializable', name: 'FILENAME', text: '—' },
        { type: 'input_value', name: 'CONVEXITY', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_3D_COLOUR,
      tooltip: t('block.import_stl.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_import_stl_defaults'],
      mutator: STATE_EXTENSION,
    },
  ]
}
