import { generator, numberInput, variableName } from '../openscadGenerator'
import { Order } from '../order'

const COMPARE_OPERATORS: Record<string, string> = {
  EQ: '==',
  NEQ: '!=',
  LT: '<',
  LTE: '<=',
  GT: '>',
  GTE: '>=',
}

// Eingebaute Blockly-Wertebloecke (in der Toolbox unter "Logik/Variablen"),
// fuer die es keinen eingebauten OpenSCAD-Generator gibt.

generator.forBlock['math_number'] = (block): [string, Order] => {
  return [String(Number(block.getFieldValue('NUM'))), Order.ATOMIC]
}

generator.forBlock['logic_boolean'] = (block): [string, Order] => {
  return [block.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false', Order.ATOMIC]
}

generator.forBlock['logic_compare'] = (block): [string, Order] => {
  const operator = COMPARE_OPERATORS[block.getFieldValue('OP') as string] ?? '=='
  const a = numberInput(generator, block, 'A', '0', Order.RELATIONAL)
  const b = numberInput(generator, block, 'B', '0', Order.RELATIONAL)
  return [`${a} ${operator} ${b}`, Order.RELATIONAL]
}

generator.forBlock['logic_operation'] = (block): [string, Order] => {
  const isAnd = block.getFieldValue('OP') === 'AND'
  const order = isAnd ? Order.LOGICAL_AND : Order.LOGICAL_OR
  const a = numberInput(generator, block, 'A', 'false', order)
  const b = numberInput(generator, block, 'B', 'false', order)
  return [`${a} ${isAnd ? '&&' : '||'} ${b}`, order]
}

generator.forBlock['text'] = (block): [string, Order] => {
  return [JSON.stringify(block.getFieldValue('TEXT') ?? ''), Order.ATOMIC]
}

generator.forBlock['text_length'] = (block): [string, Order] => {
  const value = numberInput(generator, block, 'VALUE', '""', Order.ATOMIC)
  return [`len(${value})`, Order.ATOMIC]
}

// Liest einen Modul-/Funktionsparameter (das eingebaute Prozeduren-System
// legt dafuer automatisch block-lokale Blockly-Variablen an, siehe
// codegen/blocks/procedures.ts) — anders als os_variable_get (globale
// OpenSCAD-Variablen dieser App) ist variables_get Blocklys Stock-Block
// dafuer.
generator.forBlock['variables_get'] = (block): [string, Order] => {
  return [variableName(block, 'VAR'), Order.ATOMIC]
}
