/**
 * Locker typisierte Form von Blocklys JSON-Blockdefinitionen
 * (siehe https://developers.google.com/blockly/guides/create-custom-blocks/define-blocks#json).
 * Blockly selbst nimmt hierfuer bewusst `any[]` entgegen; dieses Interface
 * dient nur der Lesbarkeit/Autovervollstaendigung in unseren Blockdateien.
 */
export interface BlockDefinition {
  type: string
  message0: string
  args0?: unknown[]
  message1?: string
  args1?: unknown[]
  message2?: string
  args2?: unknown[]
  message3?: string
  args3?: unknown[]
  message4?: string
  args4?: unknown[]
  previousStatement?: string | null
  nextStatement?: string | null
  output?: string | null
  colour: number
  tooltip: string
  helpUrl: string
  extensions?: string[]
  /** Name eines per Blockly.Extensions.registerMutator() registrierten Mutators
   *  (eigener JSON-Key, getrennt von "extensions" — siehe Blockly-Quelltext). */
  mutator?: string
  inputsInline?: boolean
}
