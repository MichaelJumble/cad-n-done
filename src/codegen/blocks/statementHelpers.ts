import type { Block } from 'blockly'
import { generator } from '../openscadGenerator'

/** Liest alle per Operand-Buttons dynamisch erzeugten Statement-Einschuebe
 *  (`${prefix}0`, `${prefix}1`, ...) nacheinander aus, unabhaengig davon,
 *  wie viele es gerade gibt, und haengt ihren Code aneinander. */
export function allStatementsCode(block: Block, prefix: string): string {
  let code = ''
  let i = 0
  while (block.getInput(`${prefix}${i}`)) {
    code += generator.statementToCode(block, `${prefix}${i}`)
    i++
  }
  return code
}
