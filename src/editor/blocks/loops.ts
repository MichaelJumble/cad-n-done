import type { BlockDefinition } from './types'
import { LOOPS_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { wrapOptions } from './blockHelpers'
import { t } from '../../i18n'

/** Schleifen: for. */
export function loopBlocks(): BlockDefinition[] {
  return [
    {
      type: 'os_for',
      message0: t('block.for.message0'),
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'i' },
        { type: 'input_value', name: 'FROM', check: 'Number' },
        { type: 'input_value', name: 'TO', check: 'Number' },
        { type: 'input_value', name: 'STEP', check: 'Number' },
        // "Huelle": alle Wiederholungen zusammen in ein union() packen statt
        // sie einzeln zu belassen (siehe codegen/blocks/loops.ts).
        { type: 'field_dropdown', name: 'HUELLE', options: wrapOptions() },
      ],
      message1: t('block.for.do'),
      args1: [{ type: 'input_statement', name: 'DO', check: STATEMENT_TYPE }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: LOOPS_COLOUR,
      tooltip: t('block.for.tooltip'),
      helpUrl: '',
      inputsInline: true,
    },
  ]
}
