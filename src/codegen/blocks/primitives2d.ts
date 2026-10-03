import type { Block } from 'blockly'
import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'

function isCentered(block: Block): boolean {
  return block.getFieldValue('CENTER') === 'TRUE'
}

generator.forBlock['os_circle'] = (block) => {
  const r = numberInput(generator, block, 'R', '1', Order.ATOMIC)
  return `circle(r=${r});\n`
}

generator.forBlock['os_square'] = (block) => {
  const x = numberInput(generator, block, 'X', '1', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '1', Order.ATOMIC)
  return `square([${x}, ${y}], center=${isCentered(block)});\n`
}
