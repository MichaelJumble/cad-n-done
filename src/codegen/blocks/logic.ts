import { generator, numberInput, variableName } from '../openscadGenerator'
import { Order } from '../order'

generator.forBlock['os_variable_set'] = (block) => {
  const name = variableName(block, 'VAR')
  const value = numberInput(generator, block, 'VALUE', '0', Order.ATOMIC)
  return `${name} = ${value};\n`
}

generator.forBlock['os_variable_get'] = (block): [string, Order] => {
  return [variableName(block, 'VAR'), Order.ATOMIC]
}

// Eingebauter Blockly-Block (in der Toolbox unter "Logik") mit Mutator fuer
// beliebig viele "sonst falls"-Zweige (IF0/DO0, IF1/DO1, ...) plus optionalem
// abschliessenden ELSE-Zweig.
generator.forBlock['controls_if'] = (block) => {
  let code = ''
  let n = 0
  while (block.getInput(`IF${n}`)) {
    const cond = numberInput(generator, block, `IF${n}`, 'false', Order.NONE)
    const branch = generator.statementToCode(block, `DO${n}`)
    code += `${n === 0 ? 'if' : 'else if'} (${cond}) {\n${branch}}\n`
    n++
  }
  if (block.getInput('ELSE')) {
    const elseBranch = generator.statementToCode(block, 'ELSE')
    code += `else {\n${elseBranch}}\n`
  }
  return code
}

generator.forBlock['logic_negate'] = (block): [string, Order] => {
  const bool = numberInput(generator, block, 'BOOL', 'false', Order.UNARY)
  return [`!${bool}`, Order.UNARY]
}

generator.forBlock['logic_ternary'] = (block): [string, Order] => {
  const cond = numberInput(generator, block, 'IF', 'false', Order.NONE)
  const thenValue = numberInput(generator, block, 'THEN', '0', Order.NONE)
  const elseValue = numberInput(generator, block, 'ELSE', '0', Order.NONE)
  return [`${cond} ? ${thenValue} : ${elseValue}`, Order.NONE]
}
