/**
 * Operator-Prioritaeten fuer OpenSCAD-Ausdruecke, analog zum Order-Enum
 * offizieller Blockly-Generatoren. Kleinere Werte binden staerker; wird an
 * `generator.valueToCode()` uebergeben, damit Blockly bei Bedarf automatisch
 * Klammern setzt.
 */
export const Order = {
  ATOMIC: 0,
  UNARY: 1,
  EXPONENTIATION: 2,
  MULTIPLICATIVE: 3,
  ADDITIVE: 4,
  RELATIONAL: 5,
  LOGICAL_AND: 6,
  LOGICAL_OR: 7,
  NONE: 99,
} as const

export type Order = (typeof Order)[keyof typeof Order]
