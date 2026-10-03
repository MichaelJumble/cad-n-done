import * as Blockly from 'blockly'
import type { Block, WorkspaceSvg } from 'blockly'
import { rerenderAllBlocks } from '../editor/rerenderAllBlocks'

/** Konvertiert alte BlockSCAD-Projektdateien (blockscad3d.com, Blockly-XML-
 *  Format) in Cadium-Bloecke. BlockSCAD ist selbst Blockly-basiert, daher
 *  ist die XML-Struktur (block/value/statement/field/mutation/next/shadow)
 *  identisch — nur einige Blocktyp- und Feldnamen unterscheiden sich, weil
 *  Cadium OpenSCAD-Primitive/-Operationen umbenannt/umgebaut hat (z.B.
 *  "simplerotate" -> "os_rotate", "CENTERDROPDOWN" -> "CENTER"-Dropdown).
 *
 *  Stock-Blockly-Bloecke, die Cadium UNVERAENDERT uebernommen hat (Module/
 *  Funktionen, math_number, Logik/Mathe/Text), werden generisch durchgereicht
 *  (gleicher Typname, gleiche Feld-/Eingangsnamen) — fuer die gibt es keine
 *  expliziten Regeln unten. Vorsicht bei scheinbar "stock" wirkenden Typen
 *  wie BlockSCADs controls_for (Zaehlschleife): Blockly registriert diesen
 *  Kern-Blocktyp global, ein Passthrough wuerde also klaglos einen Block
 *  erzeugen -- nur hat Cadium dafuer eigene Feldnamen (os_for) und KEINEN
 *  Codegenerator fuer den Original-Typnamen, was erst beim Rendern/erneuten
 *  Laden des exportierten Projekts als Absturz auffaellt. Daher unten eine
 *  explizite Regel, obwohl der Typname auf den ersten Blick "stock" aussieht.
 *
 *  circle/square/linearextrude/rotateextrude (BlockSCADs 2D-Grundformen +
 *  Hochziehen zu 3D) werden auf os_circle/os_square/os_linear_extrude/
 *  os_rotate_extrude abgebildet (siehe Toolbox-Kategorie "2D-Formen", primaer
 *  fuer genau diesen Import-Fall gedacht — im normalen Cadium-Alltag ersetzt
 *  SVG-Import/Inkscape 2D meist komfortabler). rotateextrudetwist (Radius-
 *  Versatz + Verdrehung, kein Gegenstueck in echtem OpenSCAD) hat noch keine
 *  Entsprechung. taper (BlockSCADs eigene, nicht-affine CSG-Verformung, laut
 *  BlockSCADs eigenem Quelltext selbst "Not compatible with OpenSCAD") wird
 *  auf os_taper abgebildet, das sie NUR fuer einen direkt enthaltenen Wuerfel
 *  exakt als polyhedron() nachbildet (siehe dort) - bei anderen Kindern bleibt
 *  die Geometrie unveraendert (Verjuengung ohne Wirkung), statt komplett
 *  verloren zu gehen. Alles, was Cadium sonst (noch) nicht kennt, wird
 *  uebersprungen (nicht abgebrochen) und als Warnung gesammelt zurueckgegeben. */

export interface BlockscadImportResult {
  importedCount: number
  /** Menschenlesbare, bereits uebersetzte Warnungen (z.B. uebersprungene Blocktypen). */
  warnings: string[]
}

interface ConversionContext {
  workspace: WorkspaceSvg
  skipped: Map<string, number>
}

type BlockRule = (el: Element, ctx: ConversionContext) => Block

function directChildElements(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((child) => child.tagName === tag)
}

function directChildElement(el: Element, tag: string): Element | null {
  return directChildElements(el, tag)[0] ?? null
}

function fieldValue(el: Element, name: string): string | null {
  const fieldEl = directChildElements(el, 'field').find((f) => f.getAttribute('name') === name)
  return fieldEl ? (fieldEl.textContent ?? '') : null
}

function valueElement(el: Element, name: string): Element | null {
  return directChildElements(el, 'value').find((v) => v.getAttribute('name') === name) ?? null
}

/** Ein <value>/<shadow>-Elternelement kann sowohl einen echten <block> (vom
 *  Nutzer damals ersetzt) als auch einen <shadow>-Platzhalter enthalten —
 *  der echte Block ist dann der tatsaechlich wirksame, der Shadow nur die
 *  UI-Vorbelegung. */
function effectiveChildElement(parent: Element): Element | null {
  return directChildElement(parent, 'block') ?? directChildElement(parent, 'shadow')
}

function recordSkip(ctx: ConversionContext, type: string): void {
  ctx.skipped.set(type, (ctx.skipped.get(type) ?? 0) + 1)
}

function newBlock(ctx: ConversionContext, type: string): Block {
  const block = ctx.workspace.newBlock(type)
  // initSvg() existiert nur auf einem echten WorkspaceSvg (nicht im
  // headless Blockly.Workspace, z.B. in Logik-Tests) -- daher optional.
  ;(block as Partial<Blockly.BlockSvg>).initSvg?.()
  return block
}

function resolveVariableId(workspace: WorkspaceSvg, name: string): string {
  const variableMap = workspace.getVariableMap()
  const existing = variableMap.getVariable(name)
  if (existing) return existing.getId()
  return variableMap.createVariable(name)!.getId()
}

function connectValueInput(
  block: Block,
  targetInputName: string,
  valueEl: Element | null,
  ctx: ConversionContext,
): void {
  if (!valueEl) return
  const childEl = effectiveChildElement(valueEl)
  if (!childEl) return
  const childBlock = convertBlockElement(childEl, ctx)
  if (!childBlock?.outputConnection) return
  const connection = block.getInput(targetInputName)?.connection
  connection?.connect(childBlock.outputConnection)
}

/** Folgt einer <next>-Kette ab `firstEl`, konvertiert jeden Block und
 *  verkettet die erfolgreich konvertierten per previous/next — nicht
 *  konvertierbare Bloecke (z.B. 2D-Formen) werden aus der Kette entfernt,
 *  ohne die Verarbeitung des Rests abzubrechen. */
function convertChain(firstEl: Element | null, ctx: ConversionContext): Block[] {
  const result: Block[] = []
  let currentEl = firstEl
  while (currentEl) {
    const block = convertBlockElement(currentEl, ctx)
    if (block) {
      const prev = result[result.length - 1]
      if (prev?.nextConnection && block.previousConnection) {
        prev.nextConnection.connect(block.previousConnection)
      }
      result.push(block)
    }
    const nextEl = directChildElement(currentEl, 'next')
    currentEl = nextEl ? directChildElement(nextEl, 'block') : null
  }
  return result
}

function connectStatementInput(
  block: Block,
  targetInputName: string,
  statementEl: Element | null,
  ctx: ConversionContext,
): void {
  if (!statementEl) return
  const chain = convertChain(directChildElement(statementEl, 'block'), ctx)
  const head = chain[0]
  if (!head?.previousConnection) return
  const connection = block.getInput(targetInputName)?.connection
  connection?.connect(head.previousConnection)
}

/** Generischer Fallback fuer alles, was Cadium UNVERAENDERT von Blockly
 *  uebernimmt (gleicher Typ, gleiche Feld-/Eingangsnamen) — deckt u.a.
 *  Module/Funktionen (procedures_*), math_number/math_angle, Logik, Mathe
 *  und Text ab, ohne dass dafuer je eine eigene Regel noetig ist. Existiert
 *  der Typ in Cadium nicht, wird uebersprungen. */
function convertPassthrough(el: Element, ctx: ConversionContext, type: string): Block | null {
  let block: Block
  try {
    block = newBlock(ctx, type)
  } catch {
    recordSkip(ctx, type)
    return null
  }

  const mutationEl = directChildElement(el, 'mutation')
  if (mutationEl && block.domToMutation) {
    try {
      block.domToMutation(mutationEl)
    } catch {
      // Mutation-Format inkompatibel (z.B. alte BlockSCAD-Version) -- Block
      // bleibt mit Standard-Mutation, statt den ganzen Import abzubrechen.
    }
  }

  for (const fieldEl of directChildElements(el, 'field')) {
    const name = fieldEl.getAttribute('name')
    if (!name) continue
    const text = fieldEl.textContent ?? ''
    if (name === 'VAR') {
      block.setFieldValue(resolveVariableId(ctx.workspace, text), name)
      continue
    }
    if (!block.getField(name)) continue
    try {
      block.setFieldValue(text, name)
    } catch {
      // Feldwert passt nicht (z.B. Dropdown-Option existiert in Cadium
      // nicht mehr) -- Standardwert des Feldes behalten.
    }
  }

  for (const valueEl of directChildElements(el, 'value')) {
    const name = valueEl.getAttribute('name')
    if (name) connectValueInput(block, name, valueEl, ctx)
  }
  for (const stEl of directChildElements(el, 'statement')) {
    const name = stEl.getAttribute('name')
    if (name) connectStatementInput(block, name, stEl, ctx)
  }

  return block
}

const centeredTransform = (raw: string): string => (raw === 'true' ? 'TRUE' : 'FALSE')

/** cube/cylinder: Grundkoerper ohne Kind-Objekte, nur Werte/Felder umbenannt. */
function primitiveRule(
  targetType: string,
  valueMap: Record<string, string>,
  fieldMap: Record<string, { target: string; transform?: (raw: string) => string }>,
): BlockRule {
  return (el, ctx) => {
    const block = newBlock(ctx, targetType)
    for (const [srcName, targetName] of Object.entries(valueMap)) {
      connectValueInput(block, targetName, valueElement(el, srcName), ctx)
    }
    for (const [srcName, { target, transform }] of Object.entries(fieldMap)) {
      const raw = fieldValue(el, srcName)
      if (raw === null || !block.getField(target)) continue
      block.setFieldValue(transform ? transform(raw) : raw, target)
    }
    return block
  }
}

/** Sowohl Cadiums Transformationen (DO0, DO1, ...) als auch seine
 *  Mengenoperationen (ADD0, ADD1, ...) nutzen denselben "+"/"−"-Mutator
 *  (registerOperandButtonsExtension(), siehe operandButtons.ts) -- nur mit
 *  unterschiedlichem Einschub-Praefix und Default-Anzahl. BlockSCAD
 *  nummeriert seine eigenen Einschuebe je Blocktyp uneinheitlich (A/PLUS0..
 *  bei union, A/MINUS0.. bei difference, A/WITH0.. bei hull, A/PLUS0.. bei
 *  einer mehrfach erweiterten Farbe, ...) -- statt die genauen Namen zu
 *  erraten, werden einfach ALLE direkten <statement>-Kinder in
 *  Dokumentreihenfolge gelesen und auf Cadiums einheitliches Praefix0,
 *  Praefix1, ... gemappt. Wichtig auch fuer eigentlich "Ein-Operand"-Bloecke
 *  wie translate/farbe: BlockSCAD erlaubt dort genau wie Cadium ueber
 *  dasselbe "+"-Feld zusaetzliche Geschwister-Ketten (siehe Screenshot-Case
 *  "farbe" mit mehreren PLUSn-Kindern) -- wird hier automatisch mit
 *  abgedeckt, statt nur den ersten Kind-Baum ("A") zu uebernehmen. */
function connectAllStatementsAsOperands(
  block: Block,
  el: Element,
  inputPrefix: string,
  ctx: ConversionContext,
): void {
  const statementEls = directChildElements(el, 'statement')
  const operandCount = Math.max(1, statementEls.length)
  block.loadExtraState?.({ operandCount })
  statementEls.forEach((stEl, index) => {
    connectStatementInput(block, `${inputPrefix}${index}`, stEl, ctx)
  })
}

/** translate/scale/simplerotate/$fn: umhuellen eine oder mehrere Kind-Ketten
 *  -- entspricht Cadiums Mutator-Einschueben "DO0", "DO1", ... */
function wrapperRule(targetType: string, valueMap: Record<string, string>): BlockRule {
  return (el, ctx) => {
    const block = newBlock(ctx, targetType)
    for (const [srcName, targetName] of Object.entries(valueMap)) {
      connectValueInput(block, targetName, valueElement(el, srcName), ctx)
    }
    connectAllStatementsAsOperands(block, el, 'DO', ctx)
    return block
  }
}

/** union/difference/intersection/hull/minkowski: siehe
 *  connectAllStatementsAsOperands(), Cadiums einheitlicher Praefix ist "ADD"
 *  (operandButtons.ts). */
function booleanOpRule(targetType: string): BlockRule {
  return (el, ctx) => {
    const block = newBlock(ctx, targetType)
    connectAllStatementsAsOperands(block, el, 'ADD', ctx)
    return block
  }
}

function colorRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_color')
  const colorValueEl = valueElement(el, 'COLOR')
  const childEl = colorValueEl ? effectiveChildElement(colorValueEl) : null
  const hex = childEl ? fieldValue(childEl, 'COLOUR') : null
  if (hex) block.setFieldValue(hex, 'COLOUR')
  connectAllStatementsAsOperands(block, el, 'DO', ctx)
  return block
}

/** Wie connectValueInput(), haengt das Ergebnis aber zusaetzlich an einen
 *  eingefuegten math_arithmetic-MULTIPLY-Block - fuer color_rgb im HSV-Modus
 *  (siehe colorRgbRule() unten): BlockSCADs Farbton-Feld ist 0-100 (Anteil
 *  von 360°), Cadiums os_color_hsv erwartet echte Grad (0-360). */
function connectScaledValueInput(
  block: Block,
  targetInputName: string,
  valueEl: Element | null,
  ctx: ConversionContext,
  factor: number,
): void {
  if (!valueEl) return
  const childEl = effectiveChildElement(valueEl)
  if (!childEl) return
  const childBlock = convertBlockElement(childEl, ctx)
  if (!childBlock?.outputConnection) return
  const multiplyBlock = newBlock(ctx, 'math_arithmetic')
  multiplyBlock.setFieldValue('MULTIPLY', 'OP')
  multiplyBlock.getInput('A')?.connection?.connect(childBlock.outputConnection)
  const factorBlock = newBlock(ctx, 'math_number')
  factorBlock.setFieldValue(factor, 'NUM')
  if (factorBlock.outputConnection) {
    multiplyBlock.getInput('B')?.connection?.connect(factorBlock.outputConnection)
  }
  if (multiplyBlock.outputConnection) {
    block.getInput(targetInputName)?.connection?.connect(multiplyBlock.outputConnection)
  }
}

/** color_rgb: EIN BlockSCAD-Blocktyp fuer beide Farbmodi (Dropdown-Feld
 *  SCHEME) - RGB mappt direkt auf os_color_rgb (dieselbe 0-100-Skala wie
 *  BlockSCAD selbst, siehe codegen/blocks/transforms.ts::os_color_rgb), HSV
 *  auf os_color_hsv (RED->H braucht die *3.6-Umrechnung oben, GREEN/BLUE->S/V
 *  passen direkt, beide 0-100). */
function colorRgbRule(el: Element, ctx: ConversionContext): Block {
  const isRgb = fieldValue(el, 'SCHEME') === 'RGB'
  const block = newBlock(ctx, isRgb ? 'os_color_rgb' : 'os_color_hsv')
  if (isRgb) {
    connectValueInput(block, 'R', valueElement(el, 'RED'), ctx)
    connectValueInput(block, 'G', valueElement(el, 'GREEN'), ctx)
    connectValueInput(block, 'B', valueElement(el, 'BLUE'), ctx)
  } else {
    connectScaledValueInput(block, 'H', valueElement(el, 'RED'), ctx, 3.6)
    connectValueInput(block, 'S', valueElement(el, 'GREEN'), ctx)
    connectValueInput(block, 'V', valueElement(el, 'BLUE'), ctx)
  }
  connectAllStatementsAsOperands(block, el, 'DO', ctx)
  return block
}

function variableGetRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_variable_get')
  const name = fieldValue(el, 'VAR') ?? 'x'
  block.setFieldValue(resolveVariableId(ctx.workspace, name), 'VAR')
  return block
}

function variableSetRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_variable_set')
  const name = fieldValue(el, 'VAR') ?? 'x'
  block.setFieldValue(resolveVariableId(ctx.workspace, name), 'VAR')
  connectValueInput(block, 'VALUE', valueElement(el, 'VALUE'), ctx)
  return block
}

/** BlockSCADs Zaehlschleife (controls_for) heisst in Cadium os_for -- kein
 *  reiner Stock-Blockly-Block wie im Docstring oben angenommen (BY -> STEP,
 *  HULL -> HUELLE), daher trotz "controls_"-Namen eine eigene Regel noetig.
 *  Sonst wuerde der Block zwar noch erzeugt (Blocklys eingebauter
 *  controls_for-Typ existiert weiterhin global), aber es gaebe dafuer keinen
 *  OpenSCAD-Codegenerator -- Absturz erst beim Rendern/Laden. */
function forLoopRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_for')
  const name = fieldValue(el, 'VAR') ?? 'i'
  block.setFieldValue(resolveVariableId(ctx.workspace, name), 'VAR')
  const hull = fieldValue(el, 'HULL')
  if (hull !== null) block.setFieldValue(hull, 'HUELLE')
  connectValueInput(block, 'FROM', valueElement(el, 'FROM'), ctx)
  connectValueInput(block, 'TO', valueElement(el, 'TO'), ctx)
  connectValueInput(block, 'STEP', valueElement(el, 'BY'), ctx)
  const doStatementEl =
    directChildElements(el, 'statement').find((s) => s.getAttribute('name') === 'DO') ?? null
  connectStatementInput(block, 'DO', doStatementEl, ctx)
  return block
}

/** simplemirror/simplemirror_new: wie wrapperRule(), aber mit einem Feld
 *  (mirrorplane -> PLANE) statt Value-Eingaengen - dafuer reicht wrapperRule()
 *  allein nicht (nur primitiveRule() kennt Feld-Mapping, das wiederum keine
 *  DO0/DO1-Kinder unterstuetzt). simplemirror_new blendet je nach 2D/3D-
 *  Kontext zwischen 'mirrorplane' (XY/YZ/XZ) und 'mirrorplane_cag' (YZ/XZ)
 *  um - Cadiums os_mirror kennt dieselben Werte fuer beide, daher genuegt ein
 *  Fallback auf die jeweils vorhandene der beiden. Das aeltere simplemirror
 *  hat zusaetzlich ein "sign" (pos/neg) Feld, das den Spiegel-EFFEKT nicht
 *  aendert (mirror() an einem Normalenvektor und seinem Negativen ergibt
 *  dieselbe Ebene/dasselbe Ergebnis) - wird deshalb ignoriert. */
function mirrorRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_mirror')
  const plane = fieldValue(el, 'mirrorplane') ?? fieldValue(el, 'mirrorplane_cag')
  if (plane !== null && block.getField('PLANE')) block.setFieldValue(plane, 'PLANE')
  connectAllStatementsAsOperands(block, el, 'DO', ctx)
  return block
}

/** taper: siehe os_taper (codegen/blocks/transforms.ts) fuer die genaue
 *  Nachbildung (nur fuer einen direkt enthaltenen Wuerfel exakt) - hier nur
 *  Feld/Wert-Uebernahme, analog zu mirrorRule() oben (taperaxis_cag kommt
 *  nur im 2D-Kontext vor, fuer os_taper irrelevant, aber als Fallback
 *  trotzdem gelesen, falls die Datei nur dieses Feld gesetzt hat). */
function taperRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_taper')
  const axis = fieldValue(el, 'taperaxis') ?? fieldValue(el, 'taperaxis_cag')
  if (axis !== null && block.getField('AXIS')) block.setFieldValue(axis, 'AXIS')
  connectValueInput(block, 'FACTOR', valueElement(el, 'FACTOR'), ctx)
  connectAllStatementsAsOperands(block, el, 'DO', ctx)
  return block
}

/** linearextrude: wie wrapperRule() (DO0, DO1, ... fuer die umhuellten
 *  2D-Ketten), zusaetzlich aber Felder (CENTERDROPDOWN) und ein Value-Input,
 *  der in Cadium einen ANDEREN Namen hat als in BlockSCAD (XSCALE -> SCALE) -
 *  dafuer reicht wrapperRule()/primitiveRule() allein nicht, keins der beiden
 *  deckt "Wrapper mit umbenannten Feldern" ab. BlockSCADs getrennte X-/
 *  Y-Skalierung (YSCALE) hat in Cadiums os_linear_extrude keine Entsprechung
 *  (nur eine gemeinsame SCALE) - wird nicht uebernommen, betrifft in der
 *  Praxis nur seltene ungleichmaessig skalierte Extrusionen. */
function linearExtrudeRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_linear_extrude')
  connectValueInput(block, 'HEIGHT', valueElement(el, 'HEIGHT'), ctx)
  connectValueInput(block, 'TWIST', valueElement(el, 'TWIST'), ctx)
  connectValueInput(block, 'SCALE', valueElement(el, 'XSCALE'), ctx)
  const center = fieldValue(el, 'CENTERDROPDOWN')
  if (center !== null) block.setFieldValue(centeredTransform(center), 'CENTER')
  connectAllStatementsAsOperands(block, el, 'DO', ctx)
  return block
}

/** rotateextrude: BlockSCAD kennt hier nur FACES (Seiten der Umdrehung), kein
 *  Winkel-Feld - os_rotate_extrudes ANGLE bleibt daher unverbunden auf seinem
 *  Standardwert (360°, siehe os_rotate_extrude_angle_defaults), was exakt
 *  BlockSCADs immer-volle-Umdrehung entspricht. rotateextrudetwist (Radius-
 *  Versatz + Verdrehung) hat kein Gegenstueck - echtes OpenSCADs
 *  rotate_extrude() kennt keinen twist-Parameter, wird also weiterhin
 *  uebersprungen. */
function rotateExtrudeRule(el: Element, ctx: ConversionContext): Block {
  const block = newBlock(ctx, 'os_rotate_extrude')
  connectValueInput(block, 'FACES', valueElement(el, 'FACES'), ctx)
  connectAllStatementsAsOperands(block, el, 'DO', ctx)
  return block
}

const RULES: Record<string, BlockRule> = {
  sphere: primitiveRule('os_sphere', { RAD: 'R' }, {}),
  cube: primitiveRule(
    'os_cube',
    { XVAL: 'X', YVAL: 'Y', ZVAL: 'Z' },
    { CENTERDROPDOWN: { target: 'CENTER', transform: centeredTransform } },
  ),
  cylinder: primitiveRule(
    'os_cylinder',
    { RAD1: 'R1', RAD2: 'R2', HEIGHT: 'H' },
    {
      LOCKED: { target: 'LOCK' },
      CENTERDROPDOWN: { target: 'CENTER', transform: centeredTransform },
    },
  ),
  // BlockSCADs Ring/Torus kennt kein H (Hoehe/Ellipse) -- der Zielblock
  // os_ring behaelt dafuer seinen Standard (H=0), was exakt dem originalen
  // runden Profil entspricht (siehe codegen/blocks/primitives.ts).
  torus: primitiveRule('os_ring', { RAD1: 'R1', RAD2: 'R2', SIDES: 'SIDES', FACES: 'FACES' }, {}),
  circle: primitiveRule('os_circle', { RAD: 'R' }, {}),
  square: primitiveRule(
    'os_square',
    { XVAL: 'X', YVAL: 'Y' },
    { CENTERDROPDOWN: { target: 'CENTER', transform: centeredTransform } },
  ),
  linearextrude: linearExtrudeRule,
  rotateextrude: rotateExtrudeRule,
  translate: wrapperRule('os_translate', { XVAL: 'X', YVAL: 'Y', ZVAL: 'Z' }),
  scale: wrapperRule('os_scale', { XVAL: 'X', YVAL: 'Y', ZVAL: 'Z' }),
  simplerotate: wrapperRule('os_rotate', { XVAL: 'X', YVAL: 'Y', ZVAL: 'Z' }),
  simplemirror: mirrorRule,
  simplemirror_new: mirrorRule,
  taper: taperRule,
  $fn: wrapperRule('os_sides', { SIDES: 'N' }),
  color: colorRule,
  color_rgb: colorRgbRule,
  union: booleanOpRule('os_union'),
  difference: booleanOpRule('os_difference'),
  intersection: booleanOpRule('os_intersection'),
  hull: booleanOpRule('os_hull'),
  minkowski: booleanOpRule('os_minkowski'),
  variables_get: variableGetRule,
  variables_set: variableSetRule,
  controls_for: forLoopRule,
}

function convertBlockElement(el: Element, ctx: ConversionContext): Block | null {
  const sourceType = el.getAttribute('type') ?? ''
  const rule = RULES[sourceType]
  let block: Block | null
  if (!rule) {
    block = convertPassthrough(el, ctx, sourceType)
  } else {
    try {
      block = rule(el, ctx)
    } catch (error) {
      // Blocktyp IST unterstuetzt (es gibt eine Regel dafuer) -- ein Fehler
      // hier ist also ein echter Bug, keine erwartete Luecke (anders als bei
      // convertPassthrough's unbekannten Typen). In der Warnliste sieht das
      // fuer Nutzer trotzdem wie "nicht unterstuetzt" aus, daher zusaetzlich
      // in die Konsole loggen, um das beim Debuggen unterscheiden zu koennen.
      console.error(`[convertBlockscadXml] Regel fuer "${sourceType}" ist fehlgeschlagen:`, error)
      recordSkip(ctx, sourceType)
      return null
    }
  }
  // Ein in BlockSCAD deaktivierter Block (per Rechtsklick "Block deaktivieren",
  // siehe disabled="true" im XML) bleibt auch nach dem Import deaktiviert --
  // sonst wuerde ein bewusst abgeschaltetes Teil des alten Projekts nach dem
  // Import ploetzlich wieder mitgerendert. Bewusst Blocklys EIGENER Grund
  // (MANUALLY_DISABLED) statt eines frei erfundenen Strings: Blocklys
  // eingebautes Kontextmenu "Aktivieren/Deaktivieren" kennt/loescht NUR
  // diesen einen Grund (siehe contextmenu_items.ts) -- ein eigener Grund
  // haette den importierten Block dauerhaft unreaktivierbar gemacht (das
  // Menu haette faelschlich "Deaktivieren" angezeigt, gesperrt, und selbst
  // ein Klick haette nur einen ZUSAETZLICHEN Grund ergaenzt statt den
  // eigentlichen zu entfernen).
  if (block && el.getAttribute('disabled') === 'true') {
    block.setDisabledReason(true, Blockly.constants.MANUALLY_DISABLED)
  }
  return block
}

function formatSkippedWarnings(skipped: Map<string, number>): string[] {
  return Array.from(skipped.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}${count > 1 ? ` (${count}×)` : ''}`)
}

/** Importiert eine BlockSCAD-XML-Datei in den bestehenden Workspace (fuegt
 *  hinzu, ersetzt nichts -- wie "Importieren…" fuer Cadium-eigene Projekte). */
export function importBlockscadXml(
  xmlText: string,
  workspace: WorkspaceSvg,
): BlockscadImportResult {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  const root = doc.documentElement
  if (parseError || !root || root.tagName !== 'xml') {
    return { importedCount: 0, warnings: [] }
  }

  const ctx: ConversionContext = { workspace, skipped: new Map() }
  const existingCount = workspace.getTopBlocks(false).length
  let importedCount = 0

  directChildElements(root, 'block').forEach((blockEl, index) => {
    const block = convertBlockElement(blockEl, ctx)
    if (!block) return
    const x = Number.parseFloat(blockEl.getAttribute('x') ?? '') || 0
    const y = Number.parseFloat(blockEl.getAttribute('y') ?? '') || 0
    const cascade = (existingCount + index) * 20
    block.moveBy(x + cascade, y + cascade)
    importedCount++
  })

  rerenderAllBlocks(workspace)

  return { importedCount, warnings: formatSkippedWarnings(ctx.skipped) }
}
