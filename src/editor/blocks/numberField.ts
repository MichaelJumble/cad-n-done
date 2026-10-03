import * as Blockly from 'blockly'

const FIELD_NUMBER_TYPE = 'field_number'

/** Erlaubt bei allen Zahlenfeldern (math_number ueberall im Workspace, da
 *  dessen NUM-Feld intern den Typ "field_number" nutzt) sowohl "." als auch
 *  "," als Dezimaltrennzeichen. Blocklys eingebautes FieldNumber entfernt
 *  Kommas sonst stillschweigend (fuer US-Tausendertrennzeichen gedacht),
 *  wodurch "3,14" zu 314 statt 3.14 wuerde — hier wird das Komma stattdessen
 *  vor der eigentlichen Validierung in einen Punkt umgewandelt. */
class FieldNumberLocale extends Blockly.FieldNumber {
  protected override doClassValidation_(newValue?: unknown): number | null {
    const normalised = typeof newValue === 'string' ? newValue.replace(/,/g, '.') : newValue
    return super.doClassValidation_(normalised)
  }
}

/** Ersetzt Blocklys eingebautes "field_number" (einmalig) durch die
 *  komma-tolerante Variante — wirkt dadurch auch auf den Standardblock
 *  math_number, ohne dass wir ihn selbst definieren muessten. */
export function registerLocaleNumberField(): void {
  try {
    Blockly.fieldRegistry.unregister(FIELD_NUMBER_TYPE)
  } catch {
    // Noch nicht registriert (sollte praktisch nie vorkommen) — ignorieren.
  }
  Blockly.fieldRegistry.register(FIELD_NUMBER_TYPE, FieldNumberLocale)
}
