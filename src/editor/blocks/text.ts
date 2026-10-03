import type { BlockDefinition } from './types'
import { TEXT_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { centeredOptions, fontOptions } from './blockHelpers'
import { t } from '../../i18n'

/** Text: 3D-Text (linear_extrude von text()). Text-Literal und Textlaenge
 *  nutzen die eingebauten Blockly-Bloecke "text"/"text_length" direkt
 *  (siehe editor/toolbox.ts + codegen/blocks/values.ts). */
export function textBlocks(): BlockDefinition[] {
  return [
    {
      type: 'os_text_3d',
      message0: t('block.text_3d.message0'),
      // Keine check-Beschraenkung: darf auch Zahlen/Ausdruecke annehmen
      // (z.B. eine Schleifenvariable) — der Codegen wandelt sie ueber
      // str() sicher in Text um (codegen/blocks/text.ts).
      args0: [{ type: 'input_value', name: 'TEXT' }],
      message1: t('block.text_3d.size'),
      args1: [{ type: 'input_value', name: 'SIZE', check: 'Number' }],
      message2: t('block.text_3d.height'),
      args2: [{ type: 'input_value', name: 'HEIGHT', check: 'Number' }],
      message3: t('block.text_3d.font'),
      args3: [{ type: 'field_dropdown', name: 'FONT', options: fontOptions() }],
      message4: '%1',
      args4: [{ type: 'field_dropdown', name: 'CENTER', options: centeredOptions() }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: TEXT_COLOUR,
      tooltip: t('block.text_3d.tooltip'),
      helpUrl: '',
    },
  ]
}
