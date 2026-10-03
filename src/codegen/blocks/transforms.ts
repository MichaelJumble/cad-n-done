import type { Block } from 'blockly'
import { generator, numberInput } from '../openscadGenerator'
import { Order } from '../order'
import { allStatementsCode } from './statementHelpers'

const MIRROR_PLANE_NORMALS: Record<string, string> = {
  XY: '0, 0, 1',
  YZ: '1, 0, 0',
  XZ: '0, 1, 0',
}

generator.forBlock['os_translate'] = (block) => {
  const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `translate([${x}, ${y}, ${z}]) {\n${branch}}\n`
}

generator.forBlock['os_rotate'] = (block) => {
  const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `rotate([${x}, ${y}, ${z}]) {\n${branch}}\n`
}

generator.forBlock['os_scale'] = (block) => {
  const x = numberInput(generator, block, 'X', '1', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '1', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '1', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `scale([${x}, ${y}, ${z}]) {\n${branch}}\n`
}

generator.forBlock['os_mirror'] = (block) => {
  const plane = block.getFieldValue('PLANE')
  const normal = MIRROR_PLANE_NORMALS[plane] ?? MIRROR_PLANE_NORMALS.XY
  const branch = allStatementsCode(block, 'DO')
  return `mirror([${normal}]) {\n${branch}}\n`
}

generator.forBlock['os_color'] = (block) => {
  const hex = block.getFieldValue('COLOUR')
  const branch = allStatementsCode(block, 'DO')
  return `color("${hex}") {\n${branch}}\n`
}

// OpenSCAD hat kein natives HSV -> Umrechnung in RGB als eigenstaendiger
// let()-Ausdruck (H in Grad, S/V in Prozent).
generator.forBlock['os_color_hsv'] = (block) => {
  const h = numberInput(generator, block, 'H', '0', Order.ATOMIC)
  const s = numberInput(generator, block, 'S', '100', Order.ATOMIC)
  const v = numberInput(generator, block, 'V', '100', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  const rgbExpr =
    `let(\n` +
    `${generator.INDENT}h0 = (${h}), s0 = (${s}) / 100, v0 = (${v}) / 100,\n` +
    `${generator.INDENT}H = h0 - 360 * floor(h0 / 360), C = v0 * s0, Hp = H / 60,\n` +
    `${generator.INDENT}X = C * (1 - abs((Hp - 2 * floor(Hp / 2)) - 1)), M = v0 - C, Sec = floor(Hp),\n` +
    `${generator.INDENT}RGB1 = Sec == 0 ? [C, X, 0] : Sec == 1 ? [X, C, 0] : Sec == 2 ? [0, C, X] :\n` +
    `${generator.INDENT}       Sec == 3 ? [0, X, C] : Sec == 4 ? [X, 0, C] : [C, 0, X]\n` +
    `) [RGB1[0] + M, RGB1[1] + M, RGB1[2] + M]`
  return `color(${rgbExpr}) {\n${branch}}\n`
}

// R/G/B in Prozent (0-100, wie os_color_hsvs S/V) statt 0-255 - konsistent
// zum Rest dieser App, einfache Division statt einer 0-255-Umrechnung.
generator.forBlock['os_color_rgb'] = (block) => {
  const r = numberInput(generator, block, 'R', '100', Order.ATOMIC)
  const g = numberInput(generator, block, 'G', '100', Order.ATOMIC)
  const b = numberInput(generator, block, 'B', '100', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `color([(${r}) / 100, (${g}) / 100, (${b}) / 100]) {\n${branch}}\n`
}

// $fn/$fa/$fs gelten in OpenSCAD lexikalisch nur innerhalb des
// umschliessenden Blocks.
generator.forBlock['os_sides'] = (block) => {
  const n = numberInput(generator, block, 'N', '8', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `{\n${generator.INDENT}$fn = ${n};\n${branch}}\n`
}

generator.forBlock['os_min_angle'] = (block) => {
  const a = numberInput(generator, block, 'A', '12', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `{\n${generator.INDENT}$fa = ${a};\n${branch}}\n`
}

generator.forBlock['os_min_size'] = (block) => {
  const s = numberInput(generator, block, 'S', '2', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `{\n${generator.INDENT}$fs = ${s};\n${branch}}\n`
}

generator.forBlock['os_rotate_vector'] = (block) => {
  const angle = numberInput(generator, block, 'ANGLE', '0', Order.ATOMIC)
  const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `rotate(a=${angle}, v=[${x}, ${y}, ${z}]) {\n${branch}}\n`
}

generator.forBlock['os_mirror_vector'] = (block) => {
  const x = numberInput(generator, block, 'X', '1', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '1', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '1', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `mirror([${x}, ${y}, ${z}]) {\n${branch}}\n`
}

generator.forBlock['os_resize'] = (block) => {
  const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
  const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
  const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
  const auto = block.getFieldValue('AUTO') === 'TRUE' ? 'true' : 'false'
  const branch = allStatementsCode(block, 'DO')
  return `resize([${x}, ${y}, ${z}], auto=${auto}) {\n${branch}}\n`
}

generator.forBlock['os_linear_extrude'] = (block) => {
  const height = numberInput(generator, block, 'HEIGHT', '1', Order.ATOMIC)
  const center = block.getFieldValue('CENTER') === 'TRUE' ? 'true' : 'false'
  const twist = numberInput(generator, block, 'TWIST', '0', Order.ATOMIC)
  const scale = numberInput(generator, block, 'SCALE', '1', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `linear_extrude(height=${height}, center=${center}, twist=${twist}, scale=${scale}) {\n${branch}}\n`
}

// Rotationskoerper: dreht die enthaltenen 2D-Flaechen um die Z-Achse (volle
// 360° per Standard, ueber "winkel" auch ein Teilstueck wie ein 180°-Halbring).
generator.forBlock['os_rotate_extrude'] = (block) => {
  const faces = numberInput(generator, block, 'FACES', '16', Order.ATOMIC)
  const angle = numberInput(generator, block, 'ANGLE', '360', Order.ATOMIC)
  const branch = allStatementsCode(block, 'DO')
  return `rotate_extrude($fn=${faces}, angle=${angle}) {\n${branch}}\n`
}

// Kreismuster: intern eine for-Schleife mit rotate() drumherum (optional in
// hull() gewrappt), damit der Nutzer selbst keine Schleife verdrahten muss.
// hull() ist um eine for-Schleife herum gueltiges OpenSCAD (bildet die
// konvexe Huelle aller Iterations-Ergebnisse zusammen).
generator.forBlock['os_circular_pattern'] = (block) => {
  const count = numberInput(generator, block, 'COUNT', '6', Order.ATOMIC)
  const angle = numberInput(generator, block, 'ANGLE', '360', Order.ATOMIC)
  const axis = block.getFieldValue('AXIS')
  const hull = block.getFieldValue('HULL') === 'TRUE'
  const branch = allStatementsCode(block, 'DO')
  const step = `(${angle}) / (${count})`
  const rotateVector =
    axis === 'X'
      ? `[i * (${step}), 0, 0]`
      : axis === 'Y'
        ? `[0, i * (${step}), 0]`
        : `[0, 0, i * (${step})]`
  const rotateBlock = `rotate(${rotateVector}) {\n${branch}}\n`
  const forLoop = `for (i = [0 : (${count}) - 1]) {\n${generator.prefixLines(rotateBlock, generator.INDENT)}}\n`
  return hull ? `hull() {\n${generator.prefixLines(forLoop, generator.INDENT)}}\n` : forLoop
}

// os_taper: BlockSCADs "taper" hat KEIN natives OpenSCAD-Gegenstueck - es ist
// eine reine JS-Verformung in BlockSCADs eigenem CSG-Renderer (siehe dortige
// csg.js: CSG.prototype.taper), die an JEDEM Punkt der Geometrie die beiden
// zur Taper-Achse senkrechten Koordinaten um einen mit der Position entlang
// der Achse linear interpolierten Faktor streckt (1 am unteren, `factor` am
// oberen Ende) - eine nicht-affine, positionsabhaengige Verformung, die
// OpenSCADs Transform-Modell fuer BELIEBIGE Geometrie grundsaetzlich nicht
// ausdruecken kann (kein scale()/resize()/multmatrix() variiert seinen
// Faktor je nach Position IM Objekt). Fuer einen Wuerfel lässt sie sich aber
// EXAKT nachbilden: jede seiner 8 Ecken liegt bereits an einem Extrem jeder
// Achse, der Interpolationsfaktor ist an jeder Ecke also immer exakt 0 oder 1
// - die "untere" Haelfte (0) bleibt unveraendert, die "obere" (1) wird in den
// beiden anderen Achsen um `factor` gestreckt, als expliziter polyhedron().
// Bewusst vom URSPRUNG aus skaliert (nicht von der Wuerfelmitte) - exakt wie
// im BlockSCAD-Original, ergibt bei einem NICHT zentrierten Wuerfel eine
// bewusst schiefe/"lehnende" Verjuengung statt eines symmetrischen Kegel-
// stumpfs (nur ein zentrierter Wuerfel verjuengt sich symmetrisch).
const TAPER_CUBE_FACES = '[0,1,2,3],[4,5,1,0],[5,6,2,1],[6,7,3,2],[7,4,0,3],[7,6,5,4]'

function taperedCubePolyhedron(taperBlock: Block, cubeBlock: Block, axis: string): string {
  const factor = numberInput(generator, taperBlock, 'FACTOR', '1', Order.ATOMIC)
  const sx = numberInput(generator, cubeBlock, 'X', '1', Order.ATOMIC)
  const sy = numberInput(generator, cubeBlock, 'Y', '1', Order.ATOMIC)
  const sz = numberInput(generator, cubeBlock, 'Z', '1', Order.ATOMIC)
  const centered = cubeBlock.getFieldValue('CENTER') === 'TRUE'

  const lo = (size: string): string => (centered ? `-(${size}) / 2` : '0')
  const hi = (size: string): string => (centered ? `(${size}) / 2` : `(${size})`)
  const [xlo, xhi] = [lo(sx), hi(sx)]
  const [ylo, yhi] = [lo(sy), hi(sy)]
  const [zlo, zhi] = [lo(sz), hi(sz)]

  // Reihenfolge/Nummerierung identisch zum polyhedron()-Beispiel aus der
  // OpenSCAD-Dokumentation (0-3 unten, 4-7 oben) - dazu passt TAPER_CUBE_FACES.
  const corners: [string, string, string][] = [
    [xlo, ylo, zlo],
    [xhi, ylo, zlo],
    [xhi, yhi, zlo],
    [xlo, yhi, zlo],
    [xlo, ylo, zhi],
    [xhi, ylo, zhi],
    [xhi, yhi, zhi],
    [xlo, yhi, zhi],
  ]
  const axisIndex = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2
  const axisHigh = axis === 'X' ? xhi : axis === 'Y' ? yhi : zhi

  const points = corners
    .map((corner) => {
      // Nur Ecken am "hohen" Ende der Taper-Achse (Interpolationsfaktor 1,
      // siehe Kommentar oben) bekommen die beiden ANDEREN Koordinaten mit
      // `factor` skaliert - Ecken am "niedrigen" Ende (Faktor 0) bleiben
      // unveraendert. Die Achsen-Koordinate selbst wird nie skaliert.
      const isHighCorner = corner[axisIndex] === axisHigh
      const scaled = corner.map((coord, i) =>
        i === axisIndex || !isHighCorner ? coord : `(${coord}) * (${factor})`,
      )
      return `[${scaled.join(', ')}]`
    })
    .join(', ')

  return `polyhedron(points=[${points}], faces=[${TAPER_CUBE_FACES}]);\n`
}

// Gleiche Idee wie taperedCubePolyhedron(), nur 2D (polygon() statt
// polyhedron(), 4 statt 8 Ecken, keine Z-Koordinate) - BlockSCADs taper()
// funktioniert genauso auf 2D-Formen (eigene CAG.prototype.taper()-Variante
// in deren csg.js, mathematisch identisch, nur ohne dritte Koordinate). Achse
// Z ergibt fuer eine 2D-Flaeche keinen Sinn - dafuer bleibt os_taper ohne
// Wirkung (siehe Aufrufer unten).
function taperedSquarePolygon(taperBlock: Block, squareBlock: Block, axis: 'X' | 'Y'): string {
  const factor = numberInput(generator, taperBlock, 'FACTOR', '1', Order.ATOMIC)
  const sx = numberInput(generator, squareBlock, 'X', '1', Order.ATOMIC)
  const sy = numberInput(generator, squareBlock, 'Y', '1', Order.ATOMIC)
  const centered = squareBlock.getFieldValue('CENTER') === 'TRUE'

  const lo = (size: string): string => (centered ? `-(${size}) / 2` : '0')
  const hi = (size: string): string => (centered ? `(${size}) / 2` : `(${size})`)
  const [xlo, xhi] = [lo(sx), hi(sx)]
  const [ylo, yhi] = [lo(sy), hi(sy)]

  // Reihenfolge identisch zu OpenSCADs eigenem square(): gegen den
  // Uhrzeigersinn ab der Ecke mit den kleinsten Koordinaten.
  const corners: [string, string][] = [
    [xlo, ylo],
    [xhi, ylo],
    [xhi, yhi],
    [xlo, yhi],
  ]
  const axisIndex = axis === 'X' ? 0 : 1
  const axisHigh = axis === 'X' ? xhi : yhi

  const points = corners
    .map((corner) => {
      const isHighCorner = corner[axisIndex] === axisHigh
      const scaled = corner.map((coord, i) =>
        i === axisIndex || !isHighCorner ? coord : `(${coord}) * (${factor})`,
      )
      return `[${scaled.join(', ')}]`
    })
    .join(', ')

  return `polygon(points=[${points}]);\n`
}

generator.forBlock['os_taper'] = (block) => {
  const axis = block.getFieldValue('AXIS')
  let code = ''
  let i = 0
  while (block.getInput(`DO${i}`)) {
    const child = block.getInputTargetBlock(`DO${i}`)
    if (child && child.type === 'os_cube' && !child.getNextBlock()) {
      code += taperedCubePolyhedron(block, child, axis)
    } else if (
      child &&
      child.type === 'os_square' &&
      !child.getNextBlock() &&
      (axis === 'X' || axis === 'Y')
    ) {
      code += taperedSquarePolygon(block, child, axis)
    } else {
      // Nur ein einzelner, direkt enthaltener Wuerfel oder ein 2D-Quadrat
      // (mit Achse X/Y) wird exakt nachgebildet (siehe Begruendung oben) -
      // alles andere (mehrteilige Ketten, andere Grundkoerper, verschachtelte
      // Booleans, Z-Achse bei 2D) kann nicht verjuengt werden; die Geometrie
      // bleibt dafuer wenigstens UNVERAENDERT sichtbar, statt beim
      // Import/Rendern komplett zu verschwinden.
      code += generator.statementToCode(block, `DO${i}`)
    }
    i++
  }
  return code
}
