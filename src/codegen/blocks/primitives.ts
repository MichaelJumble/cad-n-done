import type { Block } from 'blockly'
import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'

function isCentered(block: Block): boolean {
  return block.getFieldValue('CENTER') === 'TRUE'
}

/** Liest einen literalen Zahlenwert von einem Value-Eingang - identisches
 *  Muster wie readLiteralNumber() in editor/customizer.ts (dort nicht
 *  exportiert, daher hier als eigene kleine Kopie). Nicht-literale Ausdruecke
 *  (z.B. eine Variable) liefern null - der Aufrufer behandelt das je nach
 *  Kontext (siehe os_ring unten). */
function readLiteralNumber(block: Block, inputName: string): number | null {
  const target = block.getInputTargetBlock(inputName)
  if (!target || target.type !== 'math_number') return null
  const raw = target.getFieldValue('NUM')
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
  return Number.isFinite(value) ? value : null
}

generator.forBlock['os_cube'] = (block) => {
  const x = numberInput(generator, block, 'X', '1', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '1', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '1', Order.ATOMIC)
  return `cube([${x}, ${y}, ${z}], center=${isCentered(block)});\n`
}

generator.forBlock['os_sphere'] = (block) => {
  const r = numberInput(generator, block, 'R', '1', Order.ATOMIC)
  return `sphere(r=${r});\n`
}

generator.forBlock['os_cylinder'] = (block) => {
  const locked = block.getFieldValue('LOCK') === 'TRUE'
  const h = numberInput(generator, block, 'H', '1', Order.ATOMIC)
  const r1 = numberInput(generator, block, 'R1', '1', Order.ATOMIC)
  const r2 = locked ? r1 : numberInput(generator, block, 'R2', '1', Order.ATOMIC)
  return `cylinder(h=${h}, r1=${r1}, r2=${r2}, center=${isCentered(block)});\n`
}

// Torus/Ring: kein natives OpenSCAD-Primitiv. Im Normalfall (Hoehe H=0, der
// neue Standardwert) 1:1 wie der klassische BlockSCAD-Ring aufgebaut - ein
// echtes rundes Rohrprofil per circle(), verschoben um R1 und um die Achse
// rotiert (rotate_extrude). H als literale 0 wird dafuer direkt am Eingang
// erkannt (siehe readLiteralNumber oben) statt ueber einen Laufzeit-Vergleich
// im generierten Code, damit der Code im Normalfall genauso sauber bleibt wie
// das Original. Nur wenn H tatsaechlich (als Literal ungleich 0, oder leer
// gelassen) gesetzt ist, wird das Profil stattdessen ueber ein manuell
// berechnetes Polygon zu einer Ellipse verzogen - H steuert dann dessen Hoehe
// unabhaengig von R2 (z.B. fuer einen flachen Ring/Washer), eine Faehigkeit,
// die es im originalen BlockSCAD-Ring nicht gab.
generator.forBlock['os_ring'] = (block) => {
  const r1 = numberInput(generator, block, 'R1', '10', Order.ATOMIC)
  const r2 = numberInput(generator, block, 'R2', '2', Order.ATOMIC)
  const sides = numberInput(generator, block, 'SIDES', '8', Order.ATOMIC)
  const faces = numberInput(generator, block, 'FACES', '16', Order.ATOMIC)
  const literalH = readLiteralNumber(block, 'H')
  if (literalH === null || literalH === 0) {
    return `rotate_extrude($fn=${faces}) translate([${r1}, 0, 0]) circle(r=${r2}, $fn=${sides});\n`
  }
  const h = numberInput(generator, block, 'H', '0', Order.ATOMIC)
  const profile = `[for (a = [0:360/${sides}:359]) [${r1} + ${r2}*cos(a), (${h}/2)*sin(a)]]`
  return `rotate_extrude($fn=${faces}) polygon(points=${profile});\n`
}

// polyhedron() erwartet POINTS als Liste von [x,y,z]-Punkten und FACES als
// Liste von Punkt-Index-Listen - beide werden ueber Blocklys eingebauten
// lists_create_with-Baustein verschachtelt aufgebaut (siehe Generator unten).
// numberInput() trotz seines Namens hier zweckentfremdet: es ist nur ein
// generisches "Value-Eingang mit Fallback+Warnung"-Hilfsmittel, keine
// Zahl-spezifische Logik (siehe openscadGenerator.ts).
generator.forBlock['os_polyhedron'] = (block) => {
  const points = numberInput(generator, block, 'POINTS', '[]', Order.ATOMIC)
  const faces = numberInput(generator, block, 'FACES', '[]', Order.ATOMIC)
  return `polyhedron(points=${points}, faces=${faces});\n`
}

// Blocklys eingebauter "Liste erstellen mit"-Baustein (kein eigener
// OpenSCAD-Block, aber die einzige Stelle, an der eine Liste generisch
// gebaut wird - hier nur fuer os_polyhedrons POINTS/FACES gebraucht).
// itemCount_ ist ein internes, nicht oeffentlich typisiertes Feld des
// Blockly-Kernblocks (siehe dessen LISTS_CREATE_WITH-Mutator) - analog zu
// ProcedureDefBlock/ProcedureCallBlock in colorFragments.ts wird das
// benoetigte Feld hier lokal nachtypisiert statt auf `any` auszuweichen.
interface ListCreateWithBlock extends Block {
  itemCount_: number
}
generator.forBlock['lists_create_with'] = (block): [string, Order] => {
  const itemCount = (block as ListCreateWithBlock).itemCount_
  const items: string[] = []
  for (let i = 0; i < itemCount; i++) {
    items.push(generator.valueToCode(block, `ADD${i}`, Order.NONE) || 'undef')
  }
  return [`[${items.join(', ')}]`, Order.ATOMIC]
}
