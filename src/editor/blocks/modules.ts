import fieldMultilineInputPlugin from '@blockly/field-multilineinput'
const { registerFieldMultilineInput } = fieldMultilineInputPlugin
import type { BlockDefinition } from './types'
import { MODULE_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { registerNumberShadows } from './blockHelpers'
import { t } from '../../i18n'

try {
  registerFieldMultilineInput()
} catch {
  // Bereits registriert (z.B. durch Vite-HMR oder rawCode.ts) — ignorieren.
}

/** Bloecke fuer die "Module"-Kategorie, die selbst keine Geometrie erzeugen:
 *  eine reine Text-Notiz (os_comment) sowie drei Markierungen, welche
 *  Modul-Variablen spaeter als Schieberegler/Eingabefeld/Kontrollkaestchen
 *  fuer Endnutzer aufbereitet werden sollen (os_customizer_text/_number/
 *  _boolean — reine Metadaten, siehe codegen/blocks/modules.ts: werden nur
 *  als Kommentar neben den Modul-Code gestellt, das eigentliche Anpass-Panel
 *  ist ein spaeterer Ausbauschritt). Drei getrennte Bloecke statt einem mit
 *  Typ-Dropdown, weil Min/Max nur bei "Zahl" ueberhaupt Sinn ergeben - ein
 *  gemeinsamer Block haette diese Felder auch bei Text/Wahr-Falsch anzeigen
 *  muessen. */
function booleanValueOptions(): [string, string][] {
  return [
    [t('field.customizer_true'), 'TRUE'],
    [t('field.customizer_false'), 'FALSE'],
  ]
}

export function moduleAnnotationBlocks(): BlockDefinition[] {
  registerNumberShadows('os_customizer_number_defaults', { MIN: 0, MAX: 100 })

  // Beschreibung ist bei allen drei Typen identisch (message1) - nur
  // message0 (Variable, jeweils mit typ-eigenem Namen im Text, damit die
  // drei Bloecke schon am Label statt erst an ihren Feldern unterscheidbar
  // sind) und die typ-spezifischen Felder danach (Wert bzw. Min/Max)
  // unterscheiden sich.
  const descriptionRow = {
    message1: t('block.customizer_common.message1'),
    args1: [{ type: 'field_input', name: 'DESCRIPTION', text: '' }],
  }

  return [
    {
      type: 'os_comment',
      message0: t('block.comment.message0'),
      // Wie os_raw_code: field_multilinetext statt field_input, maxLines
      // begrenzt nur die Anzeige ausserhalb des Editierens (siehe dort) -
      // beim Editieren selbst bleibt beliebig viel Text eingebbar.
      args0: [{ type: 'field_multilinetext', name: 'TEXT', text: '', maxLines: 4 }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: MODULE_COLOUR,
      tooltip: t('block.comment.tooltip'),
      helpUrl: '',
    },
    {
      type: 'os_customizer_text',
      message0: t('block.customizer_text.message0'),
      args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }],
      ...descriptionRow,
      message2: t('block.customizer_text.message2'),
      args2: [{ type: 'field_input', name: 'VALUE', text: '' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: MODULE_COLOUR,
      tooltip: t('block.customizer_text.tooltip'),
      helpUrl: '',
    },
    {
      type: 'os_customizer_boolean',
      message0: t('block.customizer_boolean.message0'),
      args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }],
      ...descriptionRow,
      message2: t('block.customizer_boolean.message2'),
      args2: [{ type: 'field_dropdown', name: 'VALUE', options: booleanValueOptions() }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: MODULE_COLOUR,
      tooltip: t('block.customizer_boolean.tooltip'),
      helpUrl: '',
    },
    {
      type: 'os_customizer_number',
      message0: t('block.customizer_number.message0'),
      args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }],
      ...descriptionRow,
      message2: t('block.customizer_number.message2'),
      args2: [{ type: 'input_value', name: 'MIN', check: 'Number' }],
      message3: t('block.customizer_number.message3'),
      args3: [{ type: 'input_value', name: 'MAX', check: 'Number' }],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: MODULE_COLOUR,
      tooltip: t('block.customizer_number.tooltip'),
      helpUrl: '',
      extensions: ['os_customizer_number_defaults'],
    },
  ]
}
