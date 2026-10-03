import { generator } from '../openscadGenerator'
import { allStatementsCode } from './statementHelpers'

generator.forBlock['os_union'] = (block) => {
  return `union() {\n${allStatementsCode(block, 'ADD')}}\n`
}

generator.forBlock['os_difference'] = (block) => {
  return `difference() {\n${allStatementsCode(block, 'ADD')}}\n`
}

generator.forBlock['os_intersection'] = (block) => {
  return `intersection() {\n${allStatementsCode(block, 'ADD')}}\n`
}

generator.forBlock['os_hull'] = (block) => {
  return `hull() {\n${allStatementsCode(block, 'ADD')}}\n`
}

generator.forBlock['os_minkowski'] = (block) => {
  return `minkowski() {\n${allStatementsCode(block, 'ADD')}}\n`
}
