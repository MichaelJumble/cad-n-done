import type { BlockDefinition } from './types'
import { MATH_COLOUR } from './colours'
import { t } from '../../i18n'

/** Blockly hat den eingebauten "math_angle"-Block (Kreis-Dial-Winkeleingabe)
 *  in dieser Version nicht mehr im Kern-Blocksatz (waere ein eigenes
 *  Plugin, @blockly/field-angle) — daher ein einfacher Ersatz mit
 *  gleichem Blocktyp-Namen: reines Zahlenfeld mit "°"-Suffix, funktional
 *  identisch zu math_number (nur eine Gradzahl), passend zum
 *  BlockSCAD-Vorbild. */
export function mathAngleBlocks(): BlockDefinition[] {
  return [
    {
      type: 'math_angle',
      message0: '%1°',
      args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
      output: 'Number',
      colour: MATH_COLOUR,
      tooltip: t('block.math_angle.tooltip'),
      helpUrl: '',
    },
  ]
}
