import type { BlockDefinition } from './types'
import { PRIMITIVE_2D_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { centeredOptions, registerNumberShadows } from './blockHelpers'
import { t } from '../../i18n'

/** 2D-Grundformen: circle, square — fuer den BlockSCAD-Import (siehe
 *  blockscad/convertBlockscadXml.ts), dort per linear_extrude() zu 3D-
 *  Koerpern hochgezogen. Wie jeder andere Block hier ueber das gemeinsame
 *  STATEMENT_TYPE mit allen anderen Bloecken verkettbar/verschachtelbar -
 *  anders als BlockSCADs eigene CAG/CSG-Typtrennung gibt es dafuer keine
 *  eigene Verbindungsart, ein Kreis laesst sich also (anders als im
 *  Original) auch direkt ausserhalb eines extrude-Blocks ablegen (erzeugt
 *  dann eine von OpenSCAD ignorierte reine 2D-Flaeche ohne Hoehe). */
export function primitives2dBlocks(): BlockDefinition[] {
  registerNumberShadows('os_circle_defaults', { R: 10 })
  registerNumberShadows('os_square_defaults', { X: 10, Y: 10 })

  return [
    {
      type: 'os_circle',
      message0: t('block.circle.message0'),
      args0: [{ type: 'input_value', name: 'R', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_2D_COLOUR,
      tooltip: t('block.circle.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_circle_defaults'],
    },
    {
      type: 'os_square',
      message0: t('block.square.message0'),
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_2D_COLOUR,
      tooltip: t('block.square.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_square_defaults'],
    },
  ]
}
