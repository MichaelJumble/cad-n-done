import * as Blockly from 'blockly'
import type { Block, Workspace } from 'blockly'
import { generator, numberInput, sanitizeIdentifier, variableName } from './openscadGenerator'
import { Order } from './order'
import type { CodegenWarning } from '../types'

// Blocklys eingebaute Prozeduren-Bloecke bringen getProcedureDef()/
// getProcedureCall() mit (siehe codegen/blocks/procedures.ts fuer dieselbe
// Nachbildung des internen Interfaces).
interface ProcedureDefBlock extends Block {
  getProcedureDef(): [name: string, params: string[], hasReturn: boolean]
}
interface ProcedureCallBlock extends Block {
  getProcedureCall(): string
}

// Nur "etwas tun"-Aufrufe (keine Rueckgabe) koennen als eigenstaendiges
// Anweisungs-Statement in einer Bloecke-Kette auftauchen - "gib zurück"-Aufrufe
// sind Ausdrucks-Bloecke (Werte-Eingang), kommen hier also nie als Kettenglied vor.
const PROCEDURE_CALL_TYPE = 'procedures_callnoreturn'

/** Ein eigenstaendig renderbares OpenSCAD-Fragment mit der Farbe, in der es
 *  im Viewer dargestellt werden soll (null = manuell gewaehlte Standardfarbe),
 *  sowie der id des Top-Level-Blocks, aus dessen Kette es stammt (siehe
 *  generateColorFragments() unten) - ermoeglicht "Klick auf ein Teil im
 *  Viewer springt zum erzeugenden Block" (viewer/blockPicker.ts). Aufloesung
 *  bleibt auf Ebene des TOP-LEVEL-Blocks/Stacks, nicht das exakte
 *  verschachtelte Primitiv tief in einem hull()/difference() aus mehreren
 *  Teilen: OpenSCADs CSG-Engine verschmilzt Geometrie beim Rendern
 *  unwiderruflich zu einem Mesh, feinere Aufloesung bruachte einen
 *  Render-Aufruf PRO Primitiv statt pro Top-Level-Block. */
export interface RenderFragment {
  code: string
  color: string | null
  blockId: string
}

/** Interner Zwischenzustand innerhalb EINER partitionChain()-Rekursion -
 *  bewusst OHNE blockId: die Zuordnung zu einem Top-Level-Block passiert erst
 *  in generateColorFragments(), NACHDEM ein kompletter partitionChain()-Aufruf
 *  fuer einen Top-Level-Block zurueckgekehrt ist (siehe dort). */
interface ColorFragment {
  code: string
  color: string | null
}

const COLOR_TYPES = new Set(['os_color', 'os_color_hsv', 'os_color_rgb'])

// Modul-/Funktionsdefinitionen (siehe editor Kategorie "Module").
const PROCEDURE_DEFINITION_TYPES = new Set(['procedures_defnoreturn', 'procedures_defreturn'])

// Bloecke, deren generierter Code eine reine Zuweisung ist (keine Geometrie).
// Solche Zuweisungen muessen — anders als gewoehnliche "opake" Geschwister-
// Statements — auch in NACHFOLGENDEN, separat gerenderten Fragmenten
// (z.B. innerhalb eines darauf folgenden color()/translate()-Blocks)
// sichtbar sein, da diese sonst als voneinander unabhaengige OpenSCAD-
// Programme laufen und die Variable dort unbekannt waere.
const ASSIGNMENT_TYPES = new Set(['os_variable_set'])

// Bloecke mit genau einem DO-Slot, die Kindobjekte unveraendert durchreichen
// (nur raeumlich/parametrisch umhuellen) — hier wird die Farbgrenzen-Suche
// fortgesetzt. difference()/intersection() sind bewusst NICHT enthalten:
// OpenSCAD wertet ihre Geometrie gemeinsam aus, eine separate Farb-Extraktion
// einzelner Operanden wuerde das Ergebnis verfaelschen (ein abgezogenes/
// geschnittenes Teilstueck existiert im Resultat gar nicht mehr eigenstaendig,
// laesst sich also nicht sinnvoll als eigenes farbiges Fragment rendern).
// union() ist HIER bewusst NICHT gelistet - es bekommt unten eine eigene,
// aehnliche Behandlung (siehe os_union-Fall), da es (anders als
// difference/intersection) KEIN Geschwister-Objekt veraendert.
const TRANSPARENT_TYPES = new Set([
  'os_translate',
  'os_rotate',
  'os_scale',
  'os_mirror',
  'os_mirror_vector',
  'os_rotate_vector',
  'os_sides',
  'os_min_angle',
  'os_min_size',
  'os_resize',
  'os_linear_extrude',
  'os_rotate_extrude',
])

const MIRROR_PLANE_NORMALS: Record<string, string> = {
  XY: '0, 0, 1',
  YZ: '1, 0, 0',
  XZ: '0, 1, 0',
}

/** Oeffnung + evtl. Vorab-Anweisung eines durchsichtigen Wrapper-Blocks —
 *  identisch zur Ausgabe des normalen Codegens (codegen/blocks/transforms.ts),
 *  hier separat gehalten, damit mitten in der Kette nach Farbgrenzen gesucht
 *  werden kann, statt den kompletten Teilbaum als einen String zu erhalten. */
function wrapperOpen(block: Block): { open: string; pre: string } {
  switch (block.type) {
    case 'os_translate': {
      const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
      const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
      const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
      return { open: `translate([${x}, ${y}, ${z}])`, pre: '' }
    }
    case 'os_rotate': {
      const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
      const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
      const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
      return { open: `rotate([${x}, ${y}, ${z}])`, pre: '' }
    }
    case 'os_scale': {
      const x = numberInput(generator, block, 'X', '1', Order.ATOMIC)
      const y = numberInput(generator, block, 'Y', '1', Order.ATOMIC)
      const z = numberInput(generator, block, 'Z', '1', Order.ATOMIC)
      return { open: `scale([${x}, ${y}, ${z}])`, pre: '' }
    }
    case 'os_mirror': {
      const normal = MIRROR_PLANE_NORMALS[block.getFieldValue('PLANE')] ?? MIRROR_PLANE_NORMALS.XY
      return { open: `mirror([${normal}])`, pre: '' }
    }
    case 'os_mirror_vector': {
      const x = numberInput(generator, block, 'X', '1', Order.ATOMIC)
      const y = numberInput(generator, block, 'Y', '1', Order.ATOMIC)
      const z = numberInput(generator, block, 'Z', '1', Order.ATOMIC)
      return { open: `mirror([${x}, ${y}, ${z}])`, pre: '' }
    }
    case 'os_rotate_vector': {
      const angle = numberInput(generator, block, 'ANGLE', '0', Order.ATOMIC)
      const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
      const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
      const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
      return { open: `rotate(a=${angle}, v=[${x}, ${y}, ${z}])`, pre: '' }
    }
    case 'os_sides': {
      const n = numberInput(generator, block, 'N', '8', Order.ATOMIC)
      return { open: '', pre: `${generator.INDENT}$fn = ${n};\n` }
    }
    case 'os_min_angle': {
      const a = numberInput(generator, block, 'A', '12', Order.ATOMIC)
      return { open: '', pre: `${generator.INDENT}$fa = ${a};\n` }
    }
    case 'os_min_size': {
      const s = numberInput(generator, block, 'S', '2', Order.ATOMIC)
      return { open: '', pre: `${generator.INDENT}$fs = ${s};\n` }
    }
    case 'os_resize': {
      const x = numberInput(generator, block, 'X', '0', Order.ATOMIC)
      const y = numberInput(generator, block, 'Y', '0', Order.ATOMIC)
      const z = numberInput(generator, block, 'Z', '0', Order.ATOMIC)
      const auto = block.getFieldValue('AUTO') === 'TRUE' ? 'true' : 'false'
      return { open: `resize([${x}, ${y}, ${z}], auto=${auto})`, pre: '' }
    }
    case 'os_linear_extrude': {
      const height = numberInput(generator, block, 'HEIGHT', '1', Order.ATOMIC)
      const center = block.getFieldValue('CENTER') === 'TRUE' ? 'true' : 'false'
      const twist = numberInput(generator, block, 'TWIST', '0', Order.ATOMIC)
      const scale = numberInput(generator, block, 'SCALE', '1', Order.ATOMIC)
      return {
        open: `linear_extrude(height=${height}, center=${center}, twist=${twist}, scale=${scale})`,
        pre: '',
      }
    }
    case 'os_rotate_extrude': {
      const faces = numberInput(generator, block, 'FACES', '16', Order.ATOMIC)
      const angle = numberInput(generator, block, 'ANGLE', '360', Order.ATOMIC)
      return { open: `rotate_extrude($fn=${faces}, angle=${angle})`, pre: '' }
    }
    default:
      return { open: '', pre: '' }
  }
}

// Bekannte Werte von Schleifenvariablen (id -> aktueller Zahlenwert),
// waehrend eine os_for-Schleife mit literalen FROM/TO/STEP fuer die
// Farbaufteilung "abgerollt" wird (siehe FOR-Fall in partitionChain) - noetig,
// damit z.B. `farbwert = (a * 1)` gefolgt von `color(HSV: h=farbwert, ...)`
// PRO Durchlauf zu einer festen Zahl aufgeloest werden kann, obwohl weder
// `a` noch `farbwert` selbst literale math_number-Bloecke sind.
type ConstScope = ReadonlyMap<string, number>
const EMPTY_SCOPE: ConstScope = new Map()

/** Wertet einen Zahlen-Eingang zu einem festen Zahlenwert aus, sofern das mit
 *  den aktuell bekannten Werten (`scope`) moeglich ist - anders als eine
 *  reine "ist das ein math_number-Block"-Pruefung rechnet dies auch durch
 *  verschachtelte math_arithmetic/math_single/math_trig-Ausdruecke und durch
 *  os_variable_get-Referenzen auf bereits bekannte Variablen (z.B. die
 *  aktuelle Laufvariable einer abgerollten Schleife). Nicht aufloesbar (z.B.
 *  eine noch unbekannte Variable oder ein Modul-Parameter) liefert null -
 *  der Aufrufer faellt dann auf die alte, undurchsichtige Behandlung zurueck. */
function evalConst(block: Block | null, scope: ConstScope): number | null {
  if (!block) return null
  const num = (fieldName: string): number | null => {
    const raw = block.getFieldValue(fieldName)
    const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
    return Number.isFinite(value) ? value : null
  }
  switch (block.type) {
    case 'math_number':
    case 'math_angle':
      return num('NUM')
    case 'os_variable_get': {
      const varId = block.getFieldValue('VAR') as string
      return scope.has(varId) ? scope.get(varId)! : null
    }
    case 'math_arithmetic': {
      const a = evalConst(block.getInputTargetBlock('A'), scope)
      const b = evalConst(block.getInputTargetBlock('B'), scope)
      if (a === null || b === null) return null
      switch (block.getFieldValue('OP')) {
        case 'ADD':
          return a + b
        case 'MINUS':
          return a - b
        case 'MULTIPLY':
          return a * b
        case 'DIVIDE':
          return b === 0 ? null : a / b
        case 'POWER':
          return Math.pow(a, b)
        default:
          return null
      }
    }
    case 'math_single': {
      const n = evalConst(block.getInputTargetBlock('NUM'), scope)
      if (n === null) return null
      switch (block.getFieldValue('OP')) {
        case 'NEG':
          return -n
        case 'ROOT':
          return Math.sqrt(n)
        case 'ABS':
          return Math.abs(n)
        case 'LN':
          return Math.log(n)
        case 'LOG10':
          return Math.log10(n)
        case 'EXP':
          return Math.exp(n)
        default:
          return null
      }
    }
    case 'math_trig': {
      const n = evalConst(block.getInputTargetBlock('NUM'), scope)
      if (n === null) return null
      // OpenSCADs trig-Funktionen arbeiten in Grad, siehe codegen/blocks/math.ts.
      const rad = (n * Math.PI) / 180
      switch (block.getFieldValue('OP')) {
        case 'SIN':
          return Math.sin(rad)
        case 'COS':
          return Math.cos(rad)
        case 'TAN':
          return Math.tan(rad)
        case 'ASIN':
          return (Math.asin(n) * 180) / Math.PI
        case 'ACOS':
          return (Math.acos(n) * 180) / Math.PI
        case 'ATAN':
          return (Math.atan(n) * 180) / Math.PI
        default:
          return null
      }
    }
    default:
      return null
  }
}

// Schleifen mit sehr vielen Durchlaeufen werden NICHT abgerollt (siehe
// os_for-Fall in partitionChain) - sonst koennte ein einzelner Bau-Schritt
// tausende separate Render-Fragmente erzeugen und den Browser-Tab haengen
// lassen. Deckt den ueblichen Fall (Farbverlaeufe/Muster mit einigen bis
// einigen Dutzend Kopien) komfortabel ab.
const MAX_UNROLLED_LOOP_ITERATIONS = 200

/** Liefert alle Werte, die eine OpenSCAD-`for (v = [from:step:to])`-Schleife
 *  durchlaeuft (inklusive `to`, wie OpenSCADs eigene Bereichs-Semantik),
 *  oder null, wenn das nicht sinnvoll vorab aufzaehlbar ist (step=0, keine
 *  Durchlaeufe, oder mehr als MAX_UNROLLED_LOOP_ITERATIONS). */
function computeLoopValues(from: number, to: number, step: number): number[] | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(step) || step === 0) {
    return null
  }
  const count = Math.floor((to - from) / step + 1e-9) + 1
  if (count <= 0 || count > MAX_UNROLLED_LOOP_ITERATIONS) return null
  const values: number[] = []
  for (let i = 0; i < count; i++) values.push(from + i * step)
  return values
}

function hsvToRgb01(h: number, s: number, v: number): [number, number, number] {
  const h0 = h,
    s0 = s / 100,
    v0 = v / 100
  const hue = h0 - 360 * Math.floor(h0 / 360)
  const chroma = v0 * s0
  const hp = hue / 60
  const x = chroma * (1 - Math.abs(hp - 2 * Math.floor(hp / 2) - 1))
  const m = v0 - chroma
  const sector = Math.floor(hp)
  const rgb1: [number, number, number] =
    sector === 0
      ? [chroma, x, 0]
      : sector === 1
        ? [x, chroma, 0]
        : sector === 2
          ? [0, chroma, x]
          : sector === 3
            ? [0, x, chroma]
            : sector === 4
              ? [x, 0, chroma]
              : [chroma, 0, x]
  return [rgb1[0] + m, rgb1[1] + m, rgb1[2] + m]
}

function toHex(rgb01: [number, number, number]): string {
  const byte = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${byte(rgb01[0])}${byte(rgb01[1])}${byte(rgb01[2])}`
}

/** Ermittelt die tatsaechliche Farbe eines Farb-Blocks, sofern sie sich mit
 *  den aktuell bekannten Werten (`scope`) statisch bestimmen laesst (bei
 *  os_color_hsv/os_color_rgb nur wenn ihre Zahlen-Eingaenge zu festen Zahlen
 *  auswertbar sind, siehe evalConst() - bei einer noch unbekannten Variable/
 *  einem Ausdruck bleibt es bei der Standardfarbe). */
function resolveColorHex(block: Block, scope: ConstScope): string | null {
  if (block.type === 'os_color') return block.getFieldValue('COLOUR')
  if (block.type === 'os_color_hsv') {
    const h = evalConst(block.getInputTargetBlock('H'), scope)
    const s = evalConst(block.getInputTargetBlock('S'), scope)
    const v = evalConst(block.getInputTargetBlock('V'), scope)
    if (h === null || s === null || v === null) return null
    return toHex(hsvToRgb01(h, s, v))
  }
  if (block.type === 'os_color_rgb') {
    const r = evalConst(block.getInputTargetBlock('R'), scope)
    const g = evalConst(block.getInputTargetBlock('G'), scope)
    const b = evalConst(block.getInputTargetBlock('B'), scope)
    if (r === null || g === null || b === null) return null
    return toHex([r / 100, g / 100, b / 100])
  }
  return null
}

// difference()/intersection() werden unten als EIN opakes Geometrie-Stueck
// behandelt (ihre Operanden beeinflussen sich gegenseitig, koennen also
// anders als bei union() nicht einzeln weiter aufgeteilt werden - siehe
// os_union-Fall). Die dabei ENTSTEHENDE Oberflaeche gehoert aber tatsaechlich
// (abgesehen von den abgezogenen/weggeschnittenen Teilen) weiterhin zum
// ERSTEN Operanden ("erstes minus restliche" bzw. "erstes und restliche",
// siehe operandLabel() im Editor) - dessen eigene Farbe soll deshalb
// erhalten bleiben, statt auf die Standardfarbe zurueckzufallen.
const FIRST_OPERAND_COLOR_TYPES = new Set(['os_difference', 'os_intersection'])

/** Ermittelt die statisch bekannte Farbe am KOPF einer Blockkette: findet sie
 *  direkt einen Farb-Block, wird dessen Farbe geliefert; bei einem
 *  durchsichtigen Wrapper (translate/rotate/...) wird EINE Ebene tiefer in
 *  dessen eigenem DO0-Einschub weitergesucht (dort kann wieder ein Farb-Block
 *  oder ein weiterer Wrapper stecken). Stoesst die Suche auf echte Geometrie,
 *  einen weiteren Boolean-Block, einen Modul-Aufruf o.ae., bricht sie ergebnislos
 *  ab (null) - nur der eindeutige, direkt am Kettenkopf sichtbare Fall wird
 *  hier beruecksichtigt, keine vollstaendige Nachbildung von partitionChain(). */
function resolveChainColor(block: Block | null, scope: ConstScope): string | null {
  if (!block || !block.isEnabled()) return null
  if (COLOR_TYPES.has(block.type)) return resolveColorHex(block, scope)
  if (TRANSPARENT_TYPES.has(block.type)) {
    return resolveChainColor(block.getInputTargetBlock('DO0'), scope)
  }
  return null
}

/** Liest die Zielbloecke aller dynamisch erzeugten `${prefix}0..(n-1)`-Einschuebe
 *  eines Blocks aus (siehe editor/blocks/operandButtons.ts — Transformationen
 *  und Farb-Bloecke haben seit der Umstellung auf "+"/"−"-Einschuebe keinen
 *  einzelnen statischen "DO"-Input mehr, sondern DO0, DO1, ...). */
function operandChainStarts(block: Block, prefix: string): (Block | null)[] {
  const starts: (Block | null)[] = []
  let i = 0
  while (block.getInput(`${prefix}${i}`)) {
    starts.push(block.getInputTargetBlock(`${prefix}${i}`))
    i++
  }
  return starts
}

/** Prueft, ob die STACK-Kette eines Modul-Rumpfs einen os_raw_code-Block
 *  enthaelt. Nur dieser Blocktyp kann rohen OpenSCAD-Text mit EIGENEN
 *  function/module-Definitionen einschleusen - Inlining (siehe
 *  resolveModuleCall()) waere dann unsicher: landet der Aufruf innerhalb
 *  eines Transform-Wrappers (translate/rotate/...), sind function/module-
 *  Definitionen dort syntaktisch ungueltig (OpenSCAD erlaubt sie nur auf
 *  Top-Level oder im Rumpf eines echten Moduls, nicht im {}-Block eines
 *  Transforms - per echtem Parser-Fehler verifiziert, nicht nur vermutet).
 *  Ausserdem wuerden zwei inlinete Rueckgriffe auf denselben Variablennamen
 *  (z.B. ein von Hand per os_raw_code gesetztes "gear_type") sich im
 *  gemeinsamen Inline-Scope gegenseitig ueberschreiben, obwohl echte
 *  OpenSCAD-Module dafuer eigene, getrennte Scopes haetten. */
function containsRawCode(startBlock: Block | null): boolean {
  let block = startBlock
  while (block) {
    if (block.type === 'os_raw_code') return true
    block = block.getNextBlock()
  }
  return false
}

/** Loest einen Aufruf eines selbstdefinierten Moduls zu dessen Rumpf-
 *  Startblock auf, inkl. Parameterbindung (jeder Parameter wird als Zuweisung
 *  direkt vor dem Rumpf eingefuegt — OpenSCAD-Module haben ohnehin ihren
 *  eigenen Variablen-Scope, daher schattet das evtl. gleichnamige Variablen
 *  von aussen korrekt). `null` als bodyStart bedeutet: Definition nicht
 *  gefunden, Rekursion erkannt, oder der Rumpf enthaelt einen os_raw_code-
 *  Block (siehe containsRawCode()) — Aufrufer behandelt den Call dann wie
 *  bisher als undurchsichtiges Statement. */
function resolveModuleCall(
  block: Block,
  workspace: Workspace,
  activeModuleNames: ReadonlySet<string>,
): { bodyStart: Block | null; paramsPre: string; name: string } {
  const name = (block as ProcedureCallBlock).getProcedureCall()
  // Rekursionsschutz: ein Modul, das (direkt oder indirekt) sich selbst
  // aufruft, wuerde beim "Hineininlinen" des Rumpfs endlos weiter inlinen —
  // im Gegensatz zu echtem OpenSCAD, das Rekursion erst zur Laufzeit per
  // Abbruchbedingung beendet, kennt diese rein strukturelle Analyse keine
  // Bedingungen und wuerde sonst den Browser-Tab haengen lassen.
  if (activeModuleNames.has(name)) return { bodyStart: null, paramsPre: '', name }

  const definition = Blockly.Procedures.getDefinition(name, workspace)
  if (!definition || definition.type !== 'procedures_defnoreturn') {
    return { bodyStart: null, paramsPre: '', name }
  }
  const bodyStart = definition.getInputTargetBlock('STACK')
  if (containsRawCode(bodyStart)) {
    return { bodyStart: null, paramsPre: '', name }
  }
  const [, params] = (definition as ProcedureDefBlock).getProcedureDef()
  const argCount = block.inputList.filter((input) => input.name.startsWith('ARG')).length
  let paramsPre = ''
  for (let i = 0; i < argCount; i++) {
    const value = numberInput(generator, block, `ARG${i}`, '0', Order.ATOMIC)
    paramsPre += `${generator.INDENT}${sanitizeIdentifier(params[i])} = ${value};\n`
  }
  return { bodyStart, paramsPre, name }
}

/** Setzt ein Fragment in einen eigenen union()-Block, damit seine Zuweisungen
 *  (Laufvariable einer abgerollten Schleife, Parameter eines inline
 *  aufgeloesten Moduls) NUR fuer dieses Fragment gelten. Gleichfarbige
 *  Fragmente desselben Top-Level-Blocks werden am Ende zu EINEM OpenSCAD-
 *  Programm zusammengefuegt (siehe generateColorFragments) - stuenden ihre
 *  Zuweisungen dort alle im selben Scope, gewaenne in OpenSCAD die LETZTE
 *  (`i = 1; ...; i = 13; ...; i = 49;`), alle Durchlaeufe landeten auf demselben
 *  Wert und aus einer Schleife wuerde ein einziges Objekt. */
function scopedProgram(code: string): string {
  return `union() {\n${code}}\n`
}

function partitionChain(
  startBlock: Block | null,
  wrap: (inner: string) => string,
  currentColor: string | null,
  workspace: Workspace,
  activeModuleNames: ReadonlySet<string> = new Set(),
  initialScope: ConstScope = EMPTY_SCOPE,
): ColorFragment[] {
  const fragments: ColorFragment[] = []
  const opaqueByColor = new Map<string | null, string[]>()
  // Farben, deren opaqueByColor-Eintrag mindestens ein echtes Geometrie-Stueck
  // enthaelt (nicht nur Zuweisungen) — nur dafuer lohnt sich ein eigenes
  // Fragment; ein Fragment aus reinen Zuweisungen wuerde beim Rendern als
  // "leeres" Top-Level-Objekt erscheinen (faelschlich als Fehler markiert),
  // obwohl die Zuweisung bereits korrekt ins Preamble uebernommen wurde.
  const hasGeometryByColor = new Set<string | null>()
  // Zuweisungen, die bisher in dieser Kette gesehen wurden (in Reihenfolge) —
  // werden jedem NACHFOLGENDEN, separat gewrappten (Farbe/Transform) Fragment
  // vorangestellt, siehe ASSIGNMENT_TYPES oben.
  let preamble = ''
  // Waechst mit jeder AUFLOESBAREN os_variable_set-Zuweisung in dieser Kette
  // (siehe ASSIGNMENT_TYPES-Zweig unten) - erlaubt z.B. `color(HSV: h=farbwert)`
  // nach einem vorherigen `farbwert = (a * 1)` statisch aufzuloesen, obwohl
  // `farbwert` selbst kein literaler Zahlen-Block ist (siehe evalConst()).
  let scope = initialScope

  function addGeometryPiece(codeStr: string, color: string | null): void {
    const list = opaqueByColor.get(color) ?? []
    list.push(codeStr)
    opaqueByColor.set(color, list)
    hasGeometryByColor.add(color)
  }

  let block = startBlock
  while (block) {
    if (block.isEnabled()) {
      if (COLOR_TYPES.has(block.type)) {
        const color = resolveColorHex(block, scope) ?? currentColor
        const wrapWithPreamble = (inner: string): string => preamble + wrap(inner)
        for (const chainStart of operandChainStarts(block, 'DO')) {
          fragments.push(
            ...partitionChain(
              chainStart,
              wrapWithPreamble,
              color,
              workspace,
              activeModuleNames,
              scope,
            ),
          )
        }
      } else if (TRANSPARENT_TYPES.has(block.type)) {
        const { open, pre } = wrapperOpen(block)
        const childWrap = (inner: string): string => preamble + wrap(`${open} {\n${pre}${inner}}\n`)
        for (const chainStart of operandChainStarts(block, 'DO')) {
          fragments.push(
            ...partitionChain(
              chainStart,
              childWrap,
              currentColor,
              workspace,
              activeModuleNames,
              scope,
            ),
          )
        }
      } else if (block.type === 'os_for') {
        // Fuer die Farbaufteilung wird eine Schleife mit LITERAL bekannten
        // FROM/TO/STEP "abgerollt": pro Durchlauf ein eigenes Fragment mit
        // dem fuer DIESEN Durchlauf geltenden Wert der Laufvariable im Scope
        // - nur so kann z.B. ein color(HSV)-Block, dessen H/S/V ueber
        // Variablen von der Laufvariable abhaengen, PRO Durchlauf zu einer
        // festen Farbe aufgeloest werden (siehe evalConst()/resolveColorHex()).
        // Ohne das wuerde die GESAMTE Schleife (alle Durchlaeufe) als EIN
        // opakes Stueck in nur einer Farbe behandelt - genau das fuehrte
        // dazu, dass ein pro Durchlauf ueber Variablen berechneter
        // Farbverlauf im Viewer komplett "ignoriert" wirkte.
        const from = evalConst(block.getInputTargetBlock('FROM'), scope)
        const to = evalConst(block.getInputTargetBlock('TO'), scope)
        const step = evalConst(block.getInputTargetBlock('STEP'), scope)
        const values =
          from !== null && to !== null && step !== null ? computeLoopValues(from, to, step) : null
        if (values) {
          const varId = block.getFieldValue('VAR') as string
          const varOpenscadName = variableName(block, 'VAR')
          const bodyStart = block.getInputTargetBlock('DO')
          for (const value of values) {
            const iterScope = new Map(scope)
            // Rundung gegen Gleitkomma-Rauschen aus wiederholter Addition
            // (from + i*step), z.B. 25.000000000000004 statt 25.
            const rounded = Math.round(value * 1e9) / 1e9
            iterScope.set(varId, rounded)
            const assign = `${varOpenscadName} = ${rounded};\n`
            const iterWrap = (inner: string): string => preamble + wrap(assign + inner)
            fragments.push(
              ...partitionChain(
                bodyStart,
                iterWrap,
                currentColor,
                workspace,
                activeModuleNames,
                iterScope,
              ).map((f) => ({ ...f, code: scopedProgram(f.code) })),
            )
          }
        } else {
          // Dynamische Grenzen oder zu viele Durchlaeufe: wie bisher ein
          // einzelnes opakes Stueck in der Umgebungsfarbe.
          const code = generator.blockToCode(block, true)
          const codeStr = Array.isArray(code) ? code[0] : code
          if (codeStr) addGeometryPiece(codeStr, currentColor)
        }
      } else if (block.type === 'os_union') {
        // Anders als difference()/intersection() veraendert union() seine
        // Operanden gegenseitig NICHT - jedes Kind bleibt im Ergebnis ein
        // eigenstaendiges Geometrie-Stueck. Deshalb hier (anders als beim
        // pauschal opaken Fall unten) fuer jedes Kind separat nach
        // Farbgrenzen weitersuchen: "Kopf blau, Augen weiss" als union()
        // aus getrennt eingefaerbten Bloecken landet sonst komplett in der
        // Standardfarbe, weil das ganze union() bisher als EIN opakes Stueck
        // behandelt wurde. Unbedenklich, weil union() assoziativ/kommutativ
        // ist und OpenSCAD mehrere Geschwister-Objekte auf oberster Ebene
        // ohnehin implizit vereint - das Aufspalten aendert die resultierende
        // Geometrie nicht.
        for (const chainStart of operandChainStarts(block, 'ADD')) {
          fragments.push(
            ...partitionChain(chainStart, wrap, currentColor, workspace, activeModuleNames, scope),
          )
        }
      } else if (FIRST_OPERAND_COLOR_TYPES.has(block.type)) {
        const code = generator.blockToCode(block, true)
        const codeStr = Array.isArray(code) ? code[0] : code
        if (codeStr) {
          const firstOperand = operandChainStarts(block, 'ADD')[0] ?? null
          const color = resolveChainColor(firstOperand, scope) ?? currentColor
          addGeometryPiece(codeStr, color)
        }
      } else if (block.type === PROCEDURE_CALL_TYPE) {
        // Ruft ein selbstdefiniertes Modul auf — dessen Rumpf wird direkt an
        // dieser Stelle weiter nach Farbgrenzen durchsucht statt als
        // undurchsichtiger Aufruf behandelt zu werden, damit color()-Bloecke
        // INNERHALB des Moduls (wie jeder andere verschachtelte color()-Block)
        // im Viewer korrekt erkannt werden — sonst landet die komplette
        // Modul-Geometrie faelschlich im "keine Farbe"-Fragment.
        const { bodyStart, paramsPre, name } = resolveModuleCall(
          block,
          workspace,
          activeModuleNames,
        )
        if (bodyStart) {
          const childWrap = (inner: string): string => preamble + wrap(paramsPre + inner)
          const nested = new Set(activeModuleNames)
          nested.add(name)
          fragments.push(
            ...partitionChain(bodyStart, childWrap, currentColor, workspace, nested, scope).map(
              (f) => ({ ...f, code: scopedProgram(f.code) }),
            ),
          )
        } else {
          const code = generator.blockToCode(block, true)
          const codeStr = Array.isArray(code) ? code[0] : code
          if (codeStr) addGeometryPiece(codeStr, currentColor)
        }
      } else {
        const code = generator.blockToCode(block, true)
        const codeStr = Array.isArray(code) ? code[0] : code
        if (codeStr) {
          if (ASSIGNMENT_TYPES.has(block.type)) {
            const list = opaqueByColor.get(currentColor) ?? []
            list.push(codeStr)
            opaqueByColor.set(currentColor, list)
            preamble += codeStr
            // Auch fuer die statische Farbaufloesung NACHFOLGENDER Bloecke
            // in dieser Kette merken, falls sich der zugewiesene Wert mit
            // dem aktuellen Scope zu einer festen Zahl auswerten laesst
            // (siehe evalConst()) - z.B. `saettigung = (a * 5)` innerhalb
            // einer gerade abgerollten Schleife, wobei `a` im Scope steht.
            const varId = block.getFieldValue('VAR') as string
            const value = evalConst(block.getInputTargetBlock('VALUE'), scope)
            if (value !== null) {
              const next = new Map(scope)
              next.set(varId, value)
              scope = next
            }
          } else {
            addGeometryPiece(codeStr, currentColor)
          }
        }
      }
    }
    block = block.getNextBlock()
  }

  for (const [color, pieces] of opaqueByColor) {
    if (!hasGeometryByColor.has(color)) continue
    fragments.push({ code: wrap(pieces.join('')), color })
  }
  return fragments
}

/** Wie generateCode(), aber nach Farbe aufgeteilt: jeder farbe/farbe-HSV-Block
 *  (und alles ausserhalb jeglicher Farbbloecke) wird zu einem eigenstaendigen
 *  OpenSCAD-Programm, damit der Viewer jedes Fragment einzeln rendern und in
 *  der jeweiligen Farbe darstellen kann (STL selbst kennt keine Farbe). */
export function generateColorFragments(workspace: Workspace): {
  fragments: RenderFragment[]
  warnings: CodegenWarning[]
  /** Modul-/Funktionsdefinitionen, die JEDEM fragment.code vorangestellt sind
   *  (siehe unten) - separat zurueckgegeben, damit ein Aufrufer, der mehrere
   *  Fragmente zu EINEM gemeinsamen Programm kombiniert (z.B. die
   *  Kollisionspruefung in viewerPanel.ts), sie nur EINMAL an den Dateianfang
   *  setzen kann. Modul-/Funktionsdefinitionen sind in OpenSCAD nur auf
   *  oberster Ebene (oder im Rumpf eines anderen Moduls) gueltig - direkt in
   *  einen union()/intersection() hineinkopiert waeren sie ein Syntaxfehler. */
  definitionsPreamble: string
} {
  generator.warnings = []
  generator.init(workspace)

  const identity = (inner: string): string => inner
  const fragments: RenderFragment[] = []
  // Modul-/Funktionsdefinitionen erzeugen selbst keine Geometrie (ein Modul
  // ohne Aufruf liefert nichts) und bekommen deshalb KEIN eigenes Fragment —
  // stattdessen werden sie unten JEDEM Fragment vorangestellt. Ohne das
  // waere die Definition nur im Fragment ihrer eigenen (meist farblosen)
  // Farbgruppe vorhanden; ein Aufruf aus einem ANDERS gefaerbten Fragment
  // liefe dort ins Leere (OpenSCAD ignoriert unbekannte Module), da jedes
  // Fragment als unabhaengiges OpenSCAD-Programm gerendert wird.
  let definitionsPreamble = ''
  for (const topBlock of workspace.getTopBlocks(true)) {
    if (topBlock.outputConnection) continue
    if (PROCEDURE_DEFINITION_TYPES.has(topBlock.type)) {
      const code = generator.blockToCode(topBlock, true)
      definitionsPreamble += Array.isArray(code) ? code[0] : code
      continue
    }
    // Ein kompletter Top-Level-STACK kann (z.B. nach einem BlockSCAD-Import)
    // aus einer oder mehreren eigenstaendigen Zuweisungen VOR der eigentlichen
    // Geometrie bestehen ("durchmesser = 94;" als eigener Top-Level-Block
    // ohne Verbindung zum Modul-Aufruf). Genau wie eine Modul-Definition
    // erzeugt so ein Praefix selbst keine Geometrie, muss aber (anders als
    // eine Zuweisung MITTEN in einer Kette, siehe ASSIGNMENT_TYPES oben) in
    // JEDEM Fragment sichtbar sein, nicht nur im eigenen (meist farblosen)
    // Fragment -- sonst waere die Variable im Fragment eines ANDERS
    // gefaerbten/verbundenen Aufrufs schlicht unbekannt. Nur der reine
    // Zuweisungs-Praefix wird abgeschaelt, nicht der ganze Stack: faengt der
    // Stack stattdessen direkt mit Geometrie an, aendert sich hier nichts.
    let geometryStart: Block | null = topBlock
    while (geometryStart && ASSIGNMENT_TYPES.has(geometryStart.type)) {
      const code = generator.blockToCode(geometryStart, true)
      definitionsPreamble += Array.isArray(code) ? code[0] : code
      geometryStart = geometryStart.getNextBlock()
    }
    if (!geometryStart) continue // Stack bestand nur aus Zuweisungen, keine Geometrie.

    // Jedes Fragment dieses Top-Level-Blocks bekommt dessen id gestempelt -
    // partitionChain() selbst kennt keine Top-Level-Block-Identitaet (siehe
    // ColorFragment oben), da es rekursiv fuer beliebig tief verschachtelte
    // Aufrufe genutzt wird, hier aber ist klar: alles, was DIESER Aufruf
    // zurueckgibt, stammt aus DIESEM Top-Level-Block (auch wenn wegen des
    // abgeschaelten Praefixes evtl. bei einem SPAETEREN Block in der Kette
    // gestartet wird).
    const topFragments = partitionChain(geometryStart, identity, null, workspace)
    fragments.push(...topFragments.map((f) => ({ ...f, blockId: topBlock.id })))
  }

  // Gleichfarbige Fragmente NUR INNERHALB desselben Top-Level-Blocks
  // zusammenfassen (z.B. ein abgerolltes for/os_union), damit nicht
  // unnoetig viele separate Render-Aufrufe entstehen - ueber Bloecke hinweg
  // NICHT mehr mergen, sonst liesse sich aus dem gerenderten Mesh nicht mehr
  // zurueckverfolgen, welcher Block es erzeugt hat (siehe viewer/blockPicker.ts).
  const byKey = new Map<string, { color: string | null; blockId: string; codes: string[] }>()
  const order: string[] = []
  for (const fragment of fragments) {
    const key = `${fragment.blockId} ${fragment.color ?? ''}`
    if (!byKey.has(key)) {
      byKey.set(key, { color: fragment.color, blockId: fragment.blockId, codes: [] })
      order.push(key)
    }
    byKey.get(key)!.codes.push(fragment.code)
  }
  const merged = order.map((key) => {
    const entry = byKey.get(key)!
    return {
      color: entry.color,
      blockId: entry.blockId,
      code: definitionsPreamble + entry.codes.join(''),
    }
  })

  return { fragments: merged, warnings: generator.warnings, definitionsPreamble }
}
