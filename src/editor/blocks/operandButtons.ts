import * as Blockly from 'blockly'
import { STATEMENT_TYPE } from './constants'

export const OPERAND_BUTTON_FIELD_TYPE = 'field_operand_button'

type OperandBlock = Blockly.Block & { operandCount_: number }

export interface OperandButtonsConfig {
  /** Name des per Blockly.Extensions.register() registrierten Mutators
   *  (eigener JSON-Key "mutator", siehe BlockDefinition.mutator). */
  extensionName: string
  /** Prefix der dynamisch erzeugten Statement-Einschuebe, z.B. "ADD" -> ADD0, ADD1, ... */
  inputPrefix: string
  defaultCount: number
  minCount?: number
  /** Optionales Label je Einschub ab dem zweiten (der erste traegt die Bedeutung
   *  meist schon per Blocktitel), z.B. "plus"/"minus"/"und" bei den Mengenoperationen. */
  rowLabel?: (blockType: string, index: number) => string | null
}

/** Blendet das "−"-Feld aus, solange der Block auf der Mindestanzahl steht
 *  (Klick waere dort ohnehin wirkungslos) und wieder ein, sobald mehr als
 *  ein Einschub vorhanden ist. */
function updateMinusVisibility(block: OperandBlock, config: OperandButtonsConfig): void {
  const min = config.minCount ?? 1
  for (const field of block.getFields()) {
    if (field instanceof FieldOperandButton && field.direction === 'decrement') {
      field.setVisible(block.operandCount_ > min)
    }
  }
}

/** Baut die Einschuebe `${inputPrefix}0..(n-1)` neu auf `count`, ohne bereits
 *  belegte Einschuebe anzutasten: beim Vergroessern werden nur neue, leere
 *  Einschuebe angehaengt, beim Verkleinern nur die ueberzaehligen vom Ende
 *  entfernt — so gehen bestehende Verbindungen beim Umbauen nie verloren. */
function updateOperandShape(block: OperandBlock, config: OperandButtonsConfig): void {
  let currentCount = 0
  while (block.getInput(config.inputPrefix + currentCount)) currentCount++

  for (let n = currentCount; n < block.operandCount_; n++) {
    const input = block.appendStatementInput(config.inputPrefix + n).setCheck(STATEMENT_TYPE)
    if (n > 0) {
      const label = config.rowLabel?.(block.type, n)
      if (label) input.appendField(label)
    }
  }
  for (let n = currentCount - 1; n >= block.operandCount_; n--) {
    block.removeInput(config.inputPrefix + n)
  }
  updateMinusVisibility(block, config)
  if (block.rendered) (block as unknown as Blockly.BlockSvg).render()
}

/** Klickbares "+"/"−"-Feld direkt im Blocktitel (statt eines separaten
 *  Mutator-Dialogs) — fuegt beim Klick sofort einen Einschub hinzu bzw.
 *  entfernt den letzten. Der Feldwert selbst traegt keine Semantik; welche
 *  Einschuebe/Praefixe betroffen sind, steht in `block.operandButtons_`,
 *  das die zugehoerige Extension beim Init auf dem Block hinterlegt. */
class FieldOperandButton extends Blockly.Field<string> {
  readonly direction: 'increment' | 'decrement'

  constructor(direction: 'increment' | 'decrement') {
    super(direction === 'increment' ? '+' : '−')
    this.direction = direction
  }

  static override fromJson(
    options: Blockly.FieldConfig & { direction: 'increment' | 'decrement' },
  ): FieldOperandButton {
    return new FieldOperandButton(options.direction)
  }

  protected override showEditor_(): void {
    const block = this.getSourceBlock() as
      (OperandBlock & { operandButtonsConfig_?: OperandButtonsConfig }) | null
    const config = block?.operandButtonsConfig_
    if (!block || !config) return
    const min = config.minCount ?? 1
    const before = block.operandCount_
    block.operandCount_ =
      this.direction === 'increment'
        ? block.operandCount_ + 1
        : Math.max(min, block.operandCount_ - 1)
    if (block.operandCount_ === before) return
    updateOperandShape(block, config)
  }
}

try {
  Blockly.fieldRegistry.register(OPERAND_BUTTON_FIELD_TYPE, FieldOperandButton)
} catch {
  // Bereits registriert (z.B. durch Vite-HMR) — ignorieren.
}

/** Registriert (einmalig) einen Mutator, der einem Block dynamisch
 *  `${inputPrefix}0..(n-1)` Statement-Einschuebe gibt, ueber "+"/"−"-Felder
 *  im Titel steuerbar. Zur Verwendung: JSON-Blockdefinition braucht
 *  `mutator: config.extensionName` sowie `operandButtonFields()` als Teil
 *  von args0 (Buttons selbst) — die Statement-Einschuebe werden NICHT
 *  statisch in message0/args0 deklariert, sondern erst zur Laufzeit erzeugt. */
export function registerOperandButtonsExtension(config: OperandButtonsConfig): void {
  if (Blockly.Extensions.isRegistered(config.extensionName)) return
  Blockly.Extensions.register(config.extensionName, function (this: OperandBlock) {
    const self = this as OperandBlock & { operandButtonsConfig_?: OperandButtonsConfig }
    self.operandButtonsConfig_ = config
    self.operandCount_ = config.defaultCount
    self.saveExtraState = (): { operandCount: number } => ({ operandCount: self.operandCount_ })
    self.loadExtraState = (state: { operandCount?: number }): void => {
      self.operandCount_ = state.operandCount ?? config.defaultCount
      updateOperandShape(self, config)
    }
    updateOperandShape(self, config)
  })
}

/** Die zwei "+"/"−"-Feld-Args, die vor dem Blocktitel in message0/args0 eingefuegt werden. */
export function operandButtonFields(): [
  { type: string; direction: 'decrement' },
  { type: string; direction: 'increment' },
] {
  return [
    { type: OPERAND_BUTTON_FIELD_TYPE, direction: 'decrement' },
    { type: OPERAND_BUTTON_FIELD_TYPE, direction: 'increment' },
  ]
}
