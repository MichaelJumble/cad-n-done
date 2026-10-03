import type { BlockDefinition } from './types'
import { BOOLEAN_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { registerOperandButtonsExtension, operandButtonFields } from './operandButtons'
import { t } from '../../i18n'

const INIT_EXTENSION = 'os_boolean_operand_init'

/** Label je Operanden-Einschub oberhalb des ersten (der erste traegt schon
 *  per Blocktitel die Bedeutung, z.B. "erstes minus restliche"). */
function operandLabel(blockType: string): string | null {
  if (blockType === 'os_union') return t('field.plus')
  if (blockType === 'os_intersection') return t('field.and')
  if (blockType === 'os_difference') return t('field.minus')
  if (blockType === 'os_hull') return t('field.plus')
  if (blockType === 'os_minkowski') return t('field.plus')
  return null
}

/** Boolesche Operationen: union, difference, intersection, hull, minkowski —
 *  je Operand ein Einschub, per "+"/"−"-Feld im Titel direkt hinzufuegbar/
 *  entfernbar (kein separater Mutator-Dialog), standardmaessig 2 Einschuebe. */
export function booleanBlocks(): BlockDefinition[] {
  registerOperandButtonsExtension({
    extensionName: INIT_EXTENSION,
    inputPrefix: 'ADD',
    defaultCount: 2,
    minCount: 1,
    rowLabel: (blockType) => operandLabel(blockType),
  })
  const buttons = operandButtonFields()
  return [
    {
      type: 'os_union',
      message0: `%1 %2 ${t('block.union.message0')}`,
      args0: buttons,
      previousStatement: STATEMENT_TYPE,
      nextStatement: null,
      colour: BOOLEAN_COLOUR,
      tooltip: t('block.union.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: INIT_EXTENSION,
    },
    {
      type: 'os_difference',
      message0: `%1 %2 ${t('block.difference.message0')}`,
      args0: buttons,
      previousStatement: STATEMENT_TYPE,
      nextStatement: null,
      colour: BOOLEAN_COLOUR,
      tooltip: t('block.difference.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: INIT_EXTENSION,
    },
    {
      type: 'os_intersection',
      message0: `%1 %2 ${t('block.intersection.message0')}`,
      args0: buttons,
      previousStatement: STATEMENT_TYPE,
      nextStatement: null,
      colour: BOOLEAN_COLOUR,
      tooltip: t('block.intersection.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: INIT_EXTENSION,
    },
    {
      type: 'os_hull',
      message0: `%1 %2 ${t('block.hull.message0')}`,
      args0: buttons,
      previousStatement: STATEMENT_TYPE,
      nextStatement: null,
      colour: BOOLEAN_COLOUR,
      tooltip: t('block.hull.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: INIT_EXTENSION,
    },
    {
      type: 'os_minkowski',
      message0: `%1 %2 ${t('block.minkowski.message0')}`,
      args0: buttons,
      previousStatement: STATEMENT_TYPE,
      nextStatement: null,
      colour: BOOLEAN_COLOUR,
      tooltip: t('block.minkowski.tooltip'),
      helpUrl: '',
      inputsInline: true,
      mutator: INIT_EXTENSION,
    },
  ]
}
