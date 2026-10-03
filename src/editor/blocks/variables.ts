import type { BlockDefinition } from './types'
import { VARIABLES_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { t } from '../../i18n'

/** Variablen: setzen, lesen. */
export function variableBlocks(): BlockDefinition[] {
  return [
    {
      type: 'os_variable_set',
      message0: t('block.variable_set.message0'),
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'x' },
        { type: 'input_value', name: 'VALUE' },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: VARIABLES_COLOUR,
      tooltip: t('block.variable_set.tooltip'),
      helpUrl: '',
    },
    {
      type: 'os_variable_get',
      message0: '%1',
      args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }],
      // output: null (statt komplett weglassen!) erzeugt eine Output-Connection
      // ohne festen Typ, damit die Variable in jeden Eingang passt (Zahl,
      // Bedingung, ...) — analog zu Blocklys eingebautem variables_get.
      output: null,
      colour: VARIABLES_COLOUR,
      tooltip: t('block.variable_get.tooltip'),
      helpUrl: '',
    },
  ]
}
