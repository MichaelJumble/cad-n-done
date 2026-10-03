import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'

// Eingebaute Blockly-Mathe-Bloecke (in der Toolbox unter "Mathematik"),
// fuer die es keinen eingebauten OpenSCAD-Generator gibt. math_number
// selbst steht bereits in values.ts; math_angle ist ein eigener Ersatz
// (siehe editor/blocks/mathAngle.ts) fuer das in dieser Blockly-Version
// nicht mehr vorhandene math_angle-Kernblock-Plugin.

generator.forBlock['math_angle'] = (block): [string, Order] => {
  return [String(Number(block.getFieldValue('NUM'))), Order.ATOMIC]
}

generator.forBlock['math_arithmetic'] = (block): [string, Order] => {
  const op = block.getFieldValue('OP') as string
  switch (op) {
    case 'ADD': {
      const a = numberInput(generator, block, 'A', '0', Order.ADDITIVE)
      const b = numberInput(generator, block, 'B', '0', Order.ADDITIVE)
      return [`${a} + ${b}`, Order.ADDITIVE]
    }
    case 'MINUS': {
      const a = numberInput(generator, block, 'A', '0', Order.ADDITIVE)
      // Rechte Seite mit strengerer Ordnung anfordern als noetig, damit
      // Blockly bei einem ebenfalls additiven rechten Kind IMMER Klammern
      // setzt ("a - (b - c)" != "a - b - c") — links waere das unschaedlich,
      // aber links braucht es nie Klammern bei gleicher Prioritaet.
      const b = numberInput(generator, block, 'B', '0', Order.MULTIPLICATIVE)
      return [`${a} - ${b}`, Order.ADDITIVE]
    }
    case 'MULTIPLY': {
      const a = numberInput(generator, block, 'A', '0', Order.MULTIPLICATIVE)
      const b = numberInput(generator, block, 'B', '0', Order.MULTIPLICATIVE)
      return [`${a} * ${b}`, Order.MULTIPLICATIVE]
    }
    case 'DIVIDE': {
      const a = numberInput(generator, block, 'A', '0', Order.MULTIPLICATIVE)
      const b = numberInput(generator, block, 'B', '1', Order.EXPONENTIATION)
      return [`${a} / ${b}`, Order.MULTIPLICATIVE]
    }
    case 'POWER': {
      // OpenSCAD kennt keinen "^"-Operator, dafuer die Funktion pow().
      const a = numberInput(generator, block, 'A', '0', Order.ATOMIC)
      const b = numberInput(generator, block, 'B', '0', Order.ATOMIC)
      return [`pow(${a}, ${b})`, Order.ATOMIC]
    }
    default: {
      const a = numberInput(generator, block, 'A', '0', Order.ATOMIC)
      return [a, Order.ATOMIC]
    }
  }
}

generator.forBlock['math_single'] = (block): [string, Order] => {
  const op = block.getFieldValue('OP') as string
  if (op === 'NEG') {
    const num = numberInput(generator, block, 'NUM', '0', Order.UNARY)
    return [`-${num}`, Order.UNARY]
  }
  const num = numberInput(generator, block, 'NUM', '0', Order.ATOMIC)
  switch (op) {
    case 'ROOT':
      return [`sqrt(${num})`, Order.ATOMIC]
    case 'ABS':
      return [`abs(${num})`, Order.ATOMIC]
    case 'LN':
      return [`ln(${num})`, Order.ATOMIC]
    case 'LOG10':
      return [`log(${num})`, Order.ATOMIC]
    case 'EXP':
      return [`exp(${num})`, Order.ATOMIC]
    case 'POW10':
      return [`pow(10, ${num})`, Order.ATOMIC]
    default:
      return [num, Order.ATOMIC]
  }
}

const TRIG_FUNCTIONS: Record<string, string> = {
  SIN: 'sin',
  COS: 'cos',
  TAN: 'tan',
  ASIN: 'asin',
  ACOS: 'acos',
  ATAN: 'atan',
}

// OpenSCADs trigonometrische Funktionen arbeiten (wie Blocklys math_trig)
// bereits in Grad, kein Umrechnen noetig.
generator.forBlock['math_trig'] = (block): [string, Order] => {
  const op = block.getFieldValue('OP') as string
  const num = numberInput(generator, block, 'NUM', '0', Order.ATOMIC)
  const fn = TRIG_FUNCTIONS[op] ?? 'sin'
  return [`${fn}(${num})`, Order.ATOMIC]
}

// OpenSCAD kennt nur PI als eingebaute Konstante, der Rest wird als
// literaler Zahlenwert eingesetzt.
const MATH_CONSTANTS: Record<string, string> = {
  PI: 'PI',
  E: '2.718281828459045',
  GOLDEN_RATIO: '1.618033988749895',
  SQRT2: '1.4142135623730951',
  SQRT1_2: '0.7071067811865476',
  INFINITY: '(1 / 0)',
}

generator.forBlock['math_constant'] = (block): [string, Order] => {
  const constant = block.getFieldValue('CONSTANT') as string
  return [MATH_CONSTANTS[constant] ?? 'PI', Order.ATOMIC]
}

generator.forBlock['math_number_property'] = (block): [string, Order] => {
  const property = block.getFieldValue('PROPERTY') as string
  const num = numberInput(generator, block, 'NUMBER_TO_CHECK', '0', Order.MULTIPLICATIVE)
  switch (property) {
    case 'EVEN':
      return [`${num} % 2 == 0`, Order.RELATIONAL]
    case 'ODD':
      return [`${num} % 2 != 0`, Order.RELATIONAL]
    case 'WHOLE':
      return [`${num} == floor(${num})`, Order.RELATIONAL]
    case 'POSITIVE':
      return [`${num} > 0`, Order.RELATIONAL]
    case 'NEGATIVE':
      return [`${num} < 0`, Order.RELATIONAL]
    case 'DIVISIBLE_BY': {
      const divisor = numberInput(generator, block, 'DIVISOR', '1', Order.MULTIPLICATIVE)
      return [`${num} % ${divisor} == 0`, Order.RELATIONAL]
    }
    case 'PRIME':
      // Reiner Ausdruck (kein Funktionsaufruf noetig): pruefe, ob im Bereich
      // [2, sqrt(n)] ein Teiler existiert. Fuer n < 4 ist dieser Bereich in
      // OpenSCAD leer, das Ergebnis haengt dann nur von "n >= 2" ab (2 und 3
      // korrekt als Primzahlen erkannt).
      return [
        `(${num} >= 2 && len([for (i = [2:floor(sqrt(${num}))]) if (${num} % i == 0) i]) == 0)`,
        Order.ATOMIC,
      ]
    default:
      return ['false', Order.ATOMIC]
  }
}

generator.forBlock['math_round'] = (block): [string, Order] => {
  const op = block.getFieldValue('OP') as string
  const num = numberInput(generator, block, 'NUM', '0', Order.ATOMIC)
  const fn = op === 'ROUNDUP' ? 'ceil' : op === 'ROUNDDOWN' ? 'floor' : 'round'
  return [`${fn}(${num})`, Order.ATOMIC]
}

generator.forBlock['math_modulo'] = (block): [string, Order] => {
  const dividend = numberInput(generator, block, 'DIVIDEND', '0', Order.MULTIPLICATIVE)
  const divisor = numberInput(generator, block, 'DIVISOR', '1', Order.EXPONENTIATION)
  return [`${dividend} % ${divisor}`, Order.MULTIPLICATIVE]
}

generator.forBlock['math_constrain'] = (block): [string, Order] => {
  const value = numberInput(generator, block, 'VALUE', '0', Order.ATOMIC)
  const low = numberInput(generator, block, 'LOW', '0', Order.ATOMIC)
  const high = numberInput(generator, block, 'HIGH', '1e300', Order.ATOMIC)
  return [`min(max(${value}, ${low}), ${high})`, Order.ATOMIC]
}

// OpenSCAD hat keine eigene Ganzzahl-Zufallsfunktion, nur rands() (Liste von
// Gleitkommazahlen) — daher ein Wert aus rands(), gerundet.
generator.forBlock['math_random_int'] = (block): [string, Order] => {
  const from = numberInput(generator, block, 'FROM', '1', Order.ATOMIC)
  const to = numberInput(generator, block, 'TO', '100', Order.ATOMIC)
  return [`round(rands(${from}, ${to}, 1)[0])`, Order.ATOMIC]
}

generator.forBlock['math_random_float'] = (): [string, Order] => {
  return ['rands(0, 1, 1)[0]', Order.ATOMIC]
}
