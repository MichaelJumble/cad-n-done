import * as Blockly from 'blockly'
import { t } from '../../i18n'

/** Dropdown-Optionen fuer "zentriert"/"nicht zentriert" (OpenSCAD center=). */
export function centeredOptions(): [string, string][] {
  return [
    [t('field.not_centered'), 'FALSE'],
    [t('field.centered'), 'TRUE'],
  ]
}

/** Dropdown-Optionen fuer "einzeln"/"als Huelle" (Schleifenkoerper als union()). */
export function wrapOptions(): [string, string][] {
  return [
    [t('field.no_wrap'), 'FALSE'],
    [t('field.wrap'), 'TRUE'],
  ]
}

/** Dropdown-Optionen fuer die OpenSCAD text()-Schriftart (font=). Namen
 *  werden nicht uebersetzt, da es Schriftartnamen sind (an OpenSCAD/FreeType
 *  durchgereicht). Nur Schriftarten, die auch tatsaechlich als .ttf unter
 *  public/fonts liegen und vom Render-Worker in die openscad-wasm-VFS
 *  geschrieben werden (siehe render/fonts.ts) — alles andere wuerde beim
 *  Rendern leer bleiben. "Roboto" wurde bewusst NICHT aufgenommen: die in
 *  Debian verfuegbare .ttf bringt das in dieser openscad-wasm-Version
 *  gebuendelte FreeType zuverlaessig zum Absturz (RuntimeError), waehrend
 *  Liberation/DejaVu (dieselben Font-Familien, die auch echtes OpenSCAD
 *  standardmaessig mitbringt) einwandfrei funktionieren. Aus demselben
 *  Grund wurde von den zwei fuer 3D-Druck getesteten Stencil-artigen
 *  Schriften nur "Allerta Stencil" aufgenommen — "Stardos Stencil"
 *  crasht das WASM-FreeType genau wie Roboto. */
export function fontOptions(): [string, string][] {
  return [
    ['Liberation Sans', 'Liberation Sans'],
    ['Liberation Serif', 'Liberation Serif'],
    ['Liberation Mono', 'Liberation Mono'],
    ['DejaVu Sans', 'DejaVu Sans'],
    ['DejaVu Sans Mono', 'DejaVu Sans Mono'],
    ['Allerta Stencil', 'Allerta Stencil'],
    ['Black Ops One', 'Black Ops One'],
  ]
}

/** Registriert eine Extension, die jedem genannten Zahlen-Eingang beim
 *  Erzeugen des Blocks einen vorbelegten Shadow-Block gibt, damit das Feld
 *  sofort einen editierbaren Wert zeigt statt eines leeren Puzzleteils
 *  (JSON-Blockdefinitionen kennen dafuer keinen eigenen Key). Standardmaessig
 *  ein math_number-Shadow; `shadowType: 'math_angle'` fuer Winkel-Felder
 *  (z.B. drehen x/y/z°), damit dort von Anfang an "0°" statt "0" steht. */
export function registerNumberShadows(
  extensionName: string,
  defaults: Record<string, number>,
  shadowType: 'math_number' | 'math_angle' = 'math_number',
): void {
  if (Blockly.Extensions.isRegistered(extensionName)) return
  Blockly.Extensions.register(extensionName, function (this: Blockly.Block) {
    for (const [name, value] of Object.entries(defaults)) {
      this.getInput(name)?.connection?.setShadowState({
        type: shadowType,
        fields: { NUM: value },
      })
    }
  })
}
