import * as Blockly from 'blockly'
import { getLocale } from '.'

/** Uebersetzt Blocklys eingebaute Bloecke/Menues (math_number, Kontextmenue, ...). */
export async function applyBlocklyLocale(): Promise<void> {
  const locale = getLocale()
  const messages = locale === 'en' ? await import('blockly/msg/en') : await import('blockly/msg/de')
  // Der dynamische Import-Typ enthaelt ein synthetisches `default`-Feld
  // (Modul-Namespace) fuer CJS-Interop, das nicht Teil der eigentlichen
  // Message-Map ist — zur Laufzeit ist `messages` ein flaches String-Dict.
  Blockly.setLocale(messages as unknown as Record<string, string>)

  // Blockly nutzt fuer "etwas tun" (Modul) und "etwas tun / gib zurück"
  // (Funktion) denselben Kopftext ("um"/"to") — beide Bloecke sind dadurch
  // in der Toolbox kaum zu unterscheiden. Hier gezielt auf "Modul"/
  // "Funktion" (passend zu den OpenSCAD-Begriffen module/function)
  // aufgeteilt.
  Blockly.Msg['PROCEDURES_DEFNORETURN_TITLE'] = locale === 'en' ? 'module' : 'Modul'
  Blockly.Msg['PROCEDURES_DEFRETURN_TITLE'] = locale === 'en' ? 'function' : 'Funktion'
}
