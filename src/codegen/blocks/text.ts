import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'

generator.forBlock['os_text_3d'] = (block) => {
  const text = numberInput(generator, block, 'TEXT', '""', Order.ATOMIC)
  const size = numberInput(generator, block, 'SIZE', '10', Order.ATOMIC)
  const height = numberInput(generator, block, 'HEIGHT', '2', Order.ATOMIC)
  const font = String(block.getFieldValue('FONT'))
  const centered = block.getFieldValue('CENTER') === 'TRUE'
  const halign = centered ? 'center' : 'left'
  const valign = centered ? 'center' : 'baseline'
  // str() macht aus JEDEM Wert (Zahl, Variable, ...) sicher einen Text —
  // bei einem bereits vorhandenen Text ist str() ein No-Op (unveraendert),
  // bei z.B. einer Zahl wandelt es sie erst um. Ohne das wuerde OpenSCAD
  // bei text() mit einer Zahl einen Typfehler werfen (leere Geometrie).
  return `linear_extrude(height=${height}) text(str(${text}), size=${size}, font="${font}", halign="${halign}", valign="${valign}");\n`
}
