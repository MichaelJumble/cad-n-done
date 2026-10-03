import type { Block } from 'blockly'
import { generator, numberInput, variableName } from '../openscadGenerator'
import { Order } from '../order'

// Reine Textnotiz ohne Effekt auf die Geometrie - eine oder mehrere (bei
// mehrzeiligem Text im field_multilinetext) OpenSCAD-Kommentarzeile(n), je
// Zeile einzeln kommentiert statt nur die erste.
generator.forBlock['os_comment'] = (block) => {
  const text = String(block.getFieldValue('TEXT') ?? '')
  return (
    text
      .split('\n')
      .map((line) => `// ${line}`)
      .join('\n') + '\n'
  )
}

// Gemeinsamer Rumpf fuer die drei os_customizer_*-Bloecke (Text/Zahl/
// Wahr-Falsch) - erzeugen selbst keine Geometrie, reine Metadaten fuer ein
// spaeteres Anpass-Panel (Schieberegler/Eingabefeld/Kontrollkaestchen je
// Modul-Variable). Bis es dieses Panel gibt, dient das nur als
// dokumentierende Kommentarzeile direkt im Code.
function customizerComment(
  block: Block,
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN',
  suffix: string,
): string {
  const varName = variableName(block, 'VAR')
  const description = String(block.getFieldValue('DESCRIPTION') ?? '')
  const label = description ? `${description} ` : ''
  return `// ${label}(${varName}, ${type})${suffix}\n`
}

generator.forBlock['os_customizer_text'] = (block) => {
  const value = String(block.getFieldValue('VALUE') ?? '')
  return customizerComment(block, 'TEXT', ` = "${value}"`)
}
generator.forBlock['os_customizer_boolean'] = (block) => {
  const value = block.getFieldValue('VALUE') === 'TRUE' ? 'true' : 'false'
  return customizerComment(block, 'BOOLEAN', ` = ${value}`)
}
generator.forBlock['os_customizer_number'] = (block) => {
  const min = numberInput(generator, block, 'MIN', '0', Order.ATOMIC)
  const max = numberInput(generator, block, 'MAX', '100', Order.ATOMIC)
  return customizerComment(block, 'NUMBER', ` [${min}:${max}]`)
}
