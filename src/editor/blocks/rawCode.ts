import fieldMultilineInputPlugin from '@blockly/field-multilineinput'
const { registerFieldMultilineInput } = fieldMultilineInputPlugin
import type { BlockDefinition } from './types'
import { RAW_CODE_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { t } from '../../i18n'

try {
  registerFieldMultilineInput()
} catch {
  // Bereits registriert (z.B. durch Vite-HMR) — ignorieren.
}

/** Escape-Hatch: rohes OpenSCAD-Codefragment, wird unveraendert (1:1) in
 *  den generierten Code uebernommen — fuer alles, was (noch) keinen
 *  eigenen Block hat (list comprehensions, let(), rekursive Funktionen, ...). */
export function rawCodeBlocks(): BlockDefinition[] {
  return [
    {
      type: 'os_raw_code',
      message0: t('block.raw_code.message0'),
      // maxLines begrenzt nur die ANZEIGE ausserhalb des Editierens (siehe
      // @blockly/field-multilineinput) -- ohne das waechst der Block beim
      // Tippen und bleibt danach dauerhaft so gross (kein "Zusammenklappen"),
      // da die Feld-Anzeige sonst IMMER alle Zeilen zeigt. Beim Editieren
      // selbst bleibt weiterhin beliebig viel Text eingebbar (Scrollbalken
      // im Textfeld ab mehr als maxLines Zeilen).
      args0: [{ type: 'field_multilinetext', name: 'CODE', text: '', maxLines: 6 }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: RAW_CODE_COLOUR,
      tooltip: t('block.raw_code.tooltip'),
      helpUrl: '',
    },
  ]
}
