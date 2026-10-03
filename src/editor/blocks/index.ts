import * as Blockly from 'blockly'
import { primitiveBlocks } from './primitives'
import { primitives2dBlocks } from './primitives2d'
import { transformBlocks } from './transforms'
import { booleanBlocks } from './booleans'
import { variableBlocks } from './variables'
import { loopBlocks } from './loops'
import { mathAngleBlocks } from './mathAngle'
import { textBlocks } from './text'
import { svgBlocks } from './svg'
import { tracePhotoBlocks } from './tracePhoto'
import { stlBlocks } from './stl'
import { rawCodeBlocks } from './rawCode'
import { moduleAnnotationBlocks } from './modules'
import { registerLocaleNumberField } from './numberField'
import { TRANSFORM_COLOUR } from './colours'

let registered = false

/** Blocklys eingebauter "Liste erstellen mit"-Baustein (lists_create_with,
 *  siehe editor/toolbox.ts fuer seinen Platz in der Mathematik-Kategorie)
 *  bringt von Haus aus Blocklys eigene Listen-Standardfarbe mit, die zur
 *  Mathematik-Kategorie (siehe MATH_COLOUR in colours.ts) nicht passt - hier
 *  stattdessen bewusst auf Blau (TRANSFORM_COLOUR, dieselbe Farbe wie die
 *  Transformationen-Kategorie) umgefaerbt. init() nachtraeglich umschliessen
 *  statt den Block komplett neu zu definieren, da Blocklys Toolbox-JSON
 *  (BlockInfo) keine Farb-Ueberschreibung pro Toolbox-Eintrag kennt. */
function recolourListsCreateWith(): void {
  const blockDefinition = Blockly.Blocks['lists_create_with'] as {
    init: (this: Blockly.Block) => void
  }
  const originalInit = blockDefinition.init
  blockDefinition.init = function (this: Blockly.Block): void {
    originalInit.call(this)
    this.setColour(TRANSFORM_COLOUR)
  }
}

/** Registriert alle eigenen OpenSCAD-Blockdefinitionen bei Blockly (einmalig,
 *  in der aktuell aktiven Sprache — siehe src/i18n). */
export function registerBlocks(): void {
  if (registered) return
  registerLocaleNumberField()
  recolourListsCreateWith()
  Blockly.common.defineBlocksWithJsonArray([
    ...primitiveBlocks(),
    ...primitives2dBlocks(),
    ...transformBlocks(),
    ...booleanBlocks(),
    ...variableBlocks(),
    ...loopBlocks(),
    ...mathAngleBlocks(),
    ...textBlocks(),
    ...svgBlocks(),
    ...tracePhotoBlocks(),
    ...stlBlocks(),
    ...rawCodeBlocks(),
    ...moduleAnnotationBlocks(),
  ])
  registered = true
}
