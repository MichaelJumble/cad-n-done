import * as Blockly from 'blockly'
import type { CodegenWarning } from '../types'

/** Eigener CodeGenerator mit einem mutable Warnungs-Puffer fuer den aktuellen Lauf. */
export class OpenscadCodeGenerator extends Blockly.CodeGenerator {
  warnings: CodegenWarning[] = []

  // Die Basisklasse laesst scrub_() als No-Op-Stub stehen — jeder
  // Sprach-Generator muss ihn selbst ueberschreiben, um den Code des
  // naechsten ueber `nextConnection` verbundenen Blocks anzuhaengen (sonst
  // wird bei mehreren Geschwister-Bloecken nur der erste generiert).
  override scrub_(block: Blockly.Block, code: string, opt_thisOnly?: boolean): string {
    const nextBlock = block.nextConnection?.targetBlock() ?? null
    const nextCode = opt_thisOnly ? '' : this.blockToCode(nextBlock)
    return code + nextCode
  }

  // Blocklys Standardverhalten ueberspringt deaktivierte Bloecke beim
  // Codegen komplett (sie tauchen im generierten Code gar nicht auf). Statt-
  // dessen hier weiterhin normal generieren, aber jede Zeile auskommentieren
  // — so bleibt im Code-Panel sichtbar/nachvollziehbar, was deaktiviert
  // wurde, ohne dass es (als Kommentar) die tatsaechliche Geometrie
  // beeinflusst. Gilt nur fuer Anweisungs-Bloecke (kein output-Connection);
  // Werte-Bloecke sind in Blockly ueber die UI ohnehin nicht deaktivierbar.
  override blockToCode(
    block: Blockly.Block | null,
    opt_thisOnly?: boolean,
  ): string | [string, number] {
    if (!block || block.isEnabled() || block.isInsertionMarker() || block.outputConnection) {
      return super.blockToCode(block, opt_thisOnly)
    }
    const func = this.forBlock[block.type] as
      ((block: Blockly.Block, generator: this) => string | [string, number] | null) | undefined
    if (!func) {
      return opt_thisOnly ? '' : this.blockToCode(block.getNextBlock(), opt_thisOnly)
    }
    const rawCode = func.call(block, block, this)
    const codeStr = Array.isArray(rawCode) ? rawCode[0] : (rawCode ?? '')
    const commented = codeStr
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => `// ${line}`)
      .join('\n')
    return this.scrub_(block, commented ? `${commented}\n` : '', opt_thisOnly)
  }
}

export const generator = new OpenscadCodeGenerator('OpenSCAD')
generator.INDENT = '  '

/** Liest ein Zahlen-Eingang; leere Eingaenge fallen auf `fallback` zurueck (mit Warnung). */
export function numberInput(
  gen: OpenscadCodeGenerator,
  block: Blockly.Block,
  name: string,
  fallback: string,
  order = 0,
): string {
  const code = gen.valueToCode(block, name, order)
  if (!code) {
    gen.warnings.push({
      blockId: block.id,
      message: `Eingang "${name}" ist leer, Standardwert ${fallback} verwendet.`,
    })
    return fallback
  }
  return code
}

/** Liest den Anzeigenamen einer Variable aus einem `field_variable`-Feld. */
export function variableName(block: Blockly.Block, fieldName: string): string {
  const field = block.getField(fieldName)
  const raw = field ? field.getText() : fieldName
  return sanitizeIdentifier(raw)
}

/** Macht einen Namen zu einem gueltigen OpenSCAD-Bezeichner ([A-Za-z_][A-Za-z0-9_]*). */
export function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || '_'
}
