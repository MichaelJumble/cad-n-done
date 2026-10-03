import * as Blockly from 'blockly'
import { rerenderBlockSubtree } from '../editor/rerenderAllBlocks'
import { generateCode } from '../codegen'
import type { AgentToolResult } from '../types'

const PRIMITIVE_BLOCK_TYPES: Record<string, string> = {
  cube: 'os_cube',
  sphere: 'os_sphere',
  cylinder: 'os_cylinder',
}

const TRANSFORM_BLOCK_TYPES: Record<string, string> = {
  translate: 'os_translate',
  rotate: 'os_rotate',
  scale: 'os_scale',
  color: 'os_color',
  sides: 'os_sides',
  resize: 'os_resize',
}

const COMBINE_BLOCK_TYPES: Record<string, string> = {
  union: 'os_union',
  difference: 'os_difference',
  intersection: 'os_intersection',
}

// Rekursive Ausdrucksform fuer numerische Werte: entweder eine reine Zahl
// (unveraendertes Verhalten) oder ein Mathe-Ausdruck/Variablen-Verweis, den
// buildExpressionBlock() in einen echten Blockly-Block-Baum uebersetzt.
// Rein internes Ausfuehrungsdetail des Bau-Agenten - kein API-Vertragstyp,
// daher lokal hier definiert statt in src/types/agent.ts (tools.ts's
// input_schema bleibt bewusst ungetypt und braucht keine Anpassung).
type AgentExpr =
  | {
      op: 'add' | 'subtract' | 'multiply' | 'divide' | 'power'
      a: AgentNumericValue
      b: AgentNumericValue
    }
  | { op: 'neg' | 'sqrt' | 'abs' | 'ln' | 'log10' | 'exp'; a: AgentNumericValue }
  | { op: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'; a: AgentNumericValue }
  | { op: 'variable'; name: string }
type AgentNumericValue = number | AgentExpr

function isAgentExpr(value: unknown): value is AgentExpr {
  return typeof value === 'object' && value !== null && 'op' in value
}

function toAgentNumericValue(value: unknown, fallback: number): AgentNumericValue {
  if (isAgentExpr(value)) return value
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

const ARITH_OP: Record<string, string> = {
  add: 'ADD',
  subtract: 'MINUS',
  multiply: 'MULTIPLY',
  divide: 'DIVIDE',
  power: 'POWER',
}
const SINGLE_OP: Record<string, string> = {
  neg: 'NEG',
  sqrt: 'ROOT',
  abs: 'ABS',
  ln: 'LN',
  log10: 'LOG10',
  exp: 'EXP',
}
const TRIG_OP: Record<string, string> = {
  sin: 'SIN',
  cos: 'COS',
  tan: 'TAN',
  asin: 'ASIN',
  acos: 'ACOS',
  atan: 'ATAN',
}

/** Legt eine Blockly-Workspace-Variable mit diesem Namen an, falls sie noch
 *  nicht existiert, und liefert ihre id (field_variable-Felder wie os_for's
 *  VAR und os_variable_get's VAR speichern die id, nicht den Namen).
 *  createVariable() ist idempotent (liefert die bestehende Variable zurueck,
 *  statt eine zweite mit gleichem Namen anzulegen) - dieselbe Technik wie
 *  beim BlocksCAD-XML-Import (siehe resolveVariableId in
 *  src/blockscad/convertBlockscadXml.ts, dort nicht exportiert). */
function resolveVariableId(workspace: Blockly.WorkspaceSvg, name: string): string {
  const map = workspace.getVariableMap()
  return (map.getVariable(name) ?? map.createVariable(name)!).getId()
}

/** Baut einen Mathe-Ausdruck/Variablen-Verweis als echten Blockly-Block-Baum
 *  und gibt dessen Wurzel zurueck (noch NICHT verbunden - das macht der
 *  Aufrufer, siehe setNumeric()). Jeder erzeugte Block bekommt sofort
 *  initSvg(), da rerenderBlockSubtree() (siehe finishStep) unrendered
 *  Bloecke sonst uebergeht. */
function buildExpressionBlock(workspace: Blockly.WorkspaceSvg, expr: AgentExpr): Blockly.BlockSvg {
  switch (expr.op) {
    case 'variable': {
      const block = workspace.newBlock('os_variable_get')
      block.initSvg()
      block.setFieldValue(resolveVariableId(workspace, expr.name), 'VAR')
      return block
    }
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'power': {
      const block = workspace.newBlock('math_arithmetic')
      block.initSvg()
      block.setFieldValue(ARITH_OP[expr.op], 'OP')
      setNumeric(workspace, block, 'A', expr.a)
      setNumeric(workspace, block, 'B', expr.b)
      return block
    }
    case 'neg':
    case 'sqrt':
    case 'abs':
    case 'ln':
    case 'log10':
    case 'exp': {
      const block = workspace.newBlock('math_single')
      block.initSvg()
      block.setFieldValue(SINGLE_OP[expr.op], 'OP')
      setNumeric(workspace, block, 'NUM', expr.a)
      return block
    }
    case 'sin':
    case 'cos':
    case 'tan':
    case 'asin':
    case 'acos':
    case 'atan': {
      const block = workspace.newBlock('math_trig')
      block.initSvg()
      block.setFieldValue(TRIG_OP[expr.op], 'OP')
      setNumeric(workspace, block, 'NUM', expr.a)
      return block
    }
  }
}

/** Setzt den Wert eines Zahlen-Eingangs (X/Y/Z/R/...). Diese Eingaenge sind
 *  KEINE echten Felder auf dem Block selbst, sondern input_value-
 *  Verbindungen, ueblicherweise zu einem math_number-Shadow-Block mit Feld
 *  NUM (siehe src/editor/blocks/blockHelpers.ts::registerNumberShadows) —
 *  ein frisch erzeugter Block hat diesen Shadow meist bereits automatisch.
 *  AUSNAHME: os_for's FROM/TO/STEP haben KEINE blockinterne Shadow-
 *  Extension (nur im Toolbox-Flyout hartkodiert, siehe toolbox.ts) - bei
 *  programmatischem workspace.newBlock('os_for') ist dort also zunaechst
 *  gar kein Ziel-Block verbunden. Deshalb hier robust gegen "kein
 *  Ziel-Block vorhanden" statt nur "Ziel ist Literal".
 *
 *  Akzeptiert ab jetzt statt einer reinen Zahl auch einen Mathe-Ausdruck/
 *  Variablen-Verweis (AgentExpr) - in dem Fall wird statt eines Shadow-
 *  Werts ein echter Block-Baum (buildExpressionBlock) in die Verbindung
 *  eingesteckt, was den darunterliegenden Shadow automatisch (und
 *  nicht-destruktiv) verdeckt. */
function setNumeric(
  workspace: Blockly.WorkspaceSvg,
  block: Blockly.Block,
  inputName: string,
  value: AgentNumericValue,
): void {
  const connection = block.getInput(inputName)?.connection
  if (!connection) return
  if (typeof value === 'number') {
    const target = connection.targetBlock()
    if (target?.getField('NUM')) {
      target.setFieldValue(String(value), 'NUM')
    } else {
      target?.dispose(true) // vorherige Expression/os_variable_get ersetzen
      connection.setShadowState({ type: 'math_number', fields: { NUM: value } })
    }
    return
  }
  const exprBlock = buildExpressionBlock(workspace, value)
  connection.connect(exprBlock.outputConnection!)
}

/** Nach jedem Bau-/Reparenting-Schritt: Renderwarteschlange abwarten und NUR
 *  den betroffenen Teilbaum neu rendern (rerenderBlockSubtree), niemals den
 *  gesamten Workspace (rerenderAllBlocks) — das wuerde die Z-Reihenfolge
 *  unbeteiligter Bloecke durcheinanderbringen (siehe rerenderAllBlocks.ts).
 *
 *  finishQueuedRenders() wartet nur auf Blocklys eigene Render-Warteschlange
 *  ab, nicht auf den tatsaechlichen Bildschirm-Paint - beim schrittweisen
 *  Bauen (ein Block nach dem anderen, siehe agentClient.ts::STEP_PACING_MS)
 *  konnte der naechste Schritt dadurch schon starten, bevor der Browser den
 *  vorigen Block ueberhaupt gezeichnet hatte. Ein zusaetzliches Warten auf
 *  den naechsten Animationsframe erzwingt einen echten Paint, bevor der
 *  Aufrufer (und damit der naechste Bau-Schritt) fortfaehrt. */
async function finishStep(root: Blockly.Block): Promise<void> {
  await Blockly.renderManagement.finishQueuedRenders()
  rerenderBlockSubtree(root)
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function requireBlock(workspace: Blockly.WorkspaceSvg, id: unknown): Blockly.BlockSvg | null {
  if (typeof id !== 'string') return null
  return workspace.getBlockById(id)
}

// Mindestabstand zwischen dem untersten Punkt des bisher am weitesten unten
// liegenden Top-Level-Blocks und einem neu platzierten Block.
const NEW_BLOCK_MARGIN_Y = 20

/** Platziert einen frisch erzeugten, frei stehenden Block unterhalb aller
 *  bereits vorhandenen Top-Level-Bloecke (nicht diagonal versetzt).
 *
 *  Fruehere Version zaehlte einfach workspace.getTopBlocks(false).length als
 *  "Rang" fuer den Y-Versatz - das ging schief, sobald combine()/
 *  wrap_transform() zwischendurch Top-Level-Bloecke zu Kindern eines neuen
 *  Wrapper-Blocks machen (siehe unplug() dort): die Anzahl der Top-Level-
 *  Bloecke sinkt dann WIEDER, statt nur zu wachsen, und ein danach neu
 *  erzeugter Block bekam denselben (oder einen kleineren) Y-Versatz wie ein
 *  frueherer Block zugewiesen - mitten im Bauvorgang ueberlappten sich neue
 *  Bloecke daher mit bereits bestehenden. Erst am Ende, wenn kaum noch
 *  Top-Level-Bloecke uebrig waren, sah die Anordnung zufaellig wieder
 *  sauber aus (siehe Nutzer-Feedback: "erst am Ende").
 *
 *  Stattdessen wird hier die TATSAECHLICHE untere Kante aller anderen
 *  Top-Level-Bloecke gemessen (getBoundingRectangle() bezieht darunter
 *  angehaengte Ketten mit ein) und der neue Block direkt darunter gesetzt -
 *  das ist unabhaengig davon, wie oft zwischendurch Bloecke durch combine/
 *  wrap_transform aus der Top-Level-Menge verschwinden. */
function placeNewTopBlock(workspace: Blockly.WorkspaceSvg, block: Blockly.BlockSvg): void {
  let maxBottom: number | null = null
  for (const other of workspace.getTopBlocks(false)) {
    if (other.id === block.id) continue
    const { bottom } = other.getBoundingRectangle()
    if (maxBottom === null || bottom > maxBottom) maxBottom = bottom
  }
  if (maxBottom === null) return // einziger Block im Workspace - Spawn-Position beibehalten
  const currentY = block.getRelativeToSurfaceXY().y
  block.moveBy(0, maxBottom + NEW_BLOCK_MARGIN_Y - currentY)
}

async function addPrimitive(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const blockType = PRIMITIVE_BLOCK_TYPES[String(input.type)]
  if (!blockType) return { ok: false, error: `Unbekannter Primitiv-Typ: ${String(input.type)}` }

  const block = workspace.newBlock(blockType)
  block.initSvg()

  if (blockType === 'os_cube') {
    setNumeric(workspace, block, 'X', toAgentNumericValue(input.x, 10))
    setNumeric(workspace, block, 'Y', toAgentNumericValue(input.y, 10))
    setNumeric(workspace, block, 'Z', toAgentNumericValue(input.z, 10))
  } else if (blockType === 'os_sphere') {
    setNumeric(workspace, block, 'R', toAgentNumericValue(input.r, 10))
  } else if (blockType === 'os_cylinder') {
    const r1 = toAgentNumericValue(input.r1, 10)
    const r2 = toAgentNumericValue(input.r2, typeof r1 === 'number' ? r1 : 10)
    // LOCK spiegelt R2 automatisch von R1, solange es aktiv ist (siehe
    // primitives.ts::registerCylinderLockSync) — fuer einen Kegelstumpf
    // (r1 !== r2) muss es vorher entriegelt werden. Bei einem Ausdruck fuer
    // r1 oder r2 laesst sich Gleichheit nicht einfach per === feststellen -
    // sicherheitshalber entriegeln, damit R2 nicht faelschlich an R1
    // gekoppelt bleibt.
    if (r2 !== r1 || isAgentExpr(r1) || isAgentExpr(r2)) block.setFieldValue('FALSE', 'LOCK')
    setNumeric(workspace, block, 'R1', r1)
    setNumeric(workspace, block, 'R2', r2)
    setNumeric(workspace, block, 'H', toAgentNumericValue(input.h, 10))
  }

  if (typeof input.centered === 'boolean' && block.getField('CENTER')) {
    block.setFieldValue(input.centered ? 'TRUE' : 'FALSE', 'CENTER')
  }

  block.render()
  placeNewTopBlock(workspace, block)

  await finishStep(block)
  return { ok: true, block_id: block.id }
}

async function wrapTransform(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const child = requireBlock(workspace, input.child_block_id)
  if (!child) return { ok: false, error: `Block nicht gefunden: ${String(input.child_block_id)}` }

  const blockType = TRANSFORM_BLOCK_TYPES[String(input.type)]
  if (!blockType) return { ok: false, error: `Unbekannter Transform-Typ: ${String(input.type)}` }

  // Zielort merken, BEVOR der Block geloest wird: unplug(true) heilt die
  // Luecke in der bisherigen Kette automatisch (siehe Block.unplug in
  // node_modules/blockly/core/block.d.ts) - die neue Transformation soll
  // danach genau diese freigewordene Stelle einnehmen.
  const oldParentConn = child.previousConnection?.targetConnection ?? null
  const oldXY = child.getRelativeToSurfaceXY()
  child.unplug(true)

  const wrapper = workspace.newBlock(blockType)
  wrapper.initSvg()
  wrapper.loadExtraState?.({ operandCount: 1 })

  if (blockType === 'os_translate') {
    setNumeric(workspace, wrapper, 'X', toAgentNumericValue(input.x, 0))
    setNumeric(workspace, wrapper, 'Y', toAgentNumericValue(input.y, 0))
    setNumeric(workspace, wrapper, 'Z', toAgentNumericValue(input.z, 0))
  } else if (blockType === 'os_scale') {
    setNumeric(workspace, wrapper, 'X', toAgentNumericValue(input.x, 1))
    setNumeric(workspace, wrapper, 'Y', toAgentNumericValue(input.y, 1))
    setNumeric(workspace, wrapper, 'Z', toAgentNumericValue(input.z, 1))
  } else if (blockType === 'os_rotate') {
    setNumeric(workspace, wrapper, 'X', toAgentNumericValue(input.x, 0))
    setNumeric(workspace, wrapper, 'Y', toAgentNumericValue(input.y, 0))
    setNumeric(workspace, wrapper, 'Z', toAgentNumericValue(input.z, 0))
  } else if (blockType === 'os_color') {
    wrapper.setFieldValue(typeof input.colour === 'string' ? input.colour : '#ffcc00', 'COLOUR')
  } else if (blockType === 'os_sides') {
    setNumeric(workspace, wrapper, 'N', toAgentNumericValue(input.n, 8))
  } else if (blockType === 'os_resize') {
    setNumeric(workspace, wrapper, 'X', toAgentNumericValue(input.x, 0))
    setNumeric(workspace, wrapper, 'Y', toAgentNumericValue(input.y, 0))
    setNumeric(workspace, wrapper, 'Z', toAgentNumericValue(input.z, 0))
    if (typeof input.auto === 'boolean') {
      wrapper.setFieldValue(input.auto ? 'TRUE' : 'FALSE', 'AUTO')
    }
  }

  if (oldParentConn) {
    oldParentConn.connect(wrapper.previousConnection!)
  } else {
    wrapper.moveBy(oldXY.x, oldXY.y)
  }
  wrapper.getInput('DO0')!.connection!.connect(child.previousConnection!)

  wrapper.render()
  const root = oldParentConn ? oldParentConn.getSourceBlock() : wrapper
  await finishStep(root)
  return { ok: true, block_id: wrapper.id }
}

async function combine(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const blockType = COMBINE_BLOCK_TYPES[String(input.type)]
  if (!blockType) return { ok: false, error: `Unbekannter Kombinations-Typ: ${String(input.type)}` }

  const ids = input.child_block_ids
  if (!Array.isArray(ids) || ids.length < 2) {
    return { ok: false, error: 'combine benoetigt mindestens 2 child_block_ids' }
  }

  const children: Blockly.BlockSvg[] = []
  for (const id of ids) {
    const block = requireBlock(workspace, id)
    if (!block) return { ok: false, error: `Block nicht gefunden: ${String(id)}` }
    children.push(block)
  }

  const first = children[0]
  const oldParentConn = first.previousConnection?.targetConnection ?? null
  const oldXY = first.getRelativeToSurfaceXY()

  for (const child of children) child.unplug(true)

  const combined = workspace.newBlock(blockType)
  combined.initSvg()
  combined.loadExtraState?.({ operandCount: children.length })

  children.forEach((child, index) => {
    combined.getInput(`ADD${index}`)!.connection!.connect(child.previousConnection!)
  })

  if (oldParentConn) {
    oldParentConn.connect(combined.previousConnection!)
  } else {
    combined.moveBy(oldXY.x, oldXY.y)
  }

  combined.render()
  const root = oldParentConn ? oldParentConn.getSourceBlock() : combined
  await finishStep(root)
  return { ok: true, block_id: combined.id }
}

async function createModule(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'modul'
  const ids = input.body_block_ids
  if (!Array.isArray(ids) || ids.length < 1) {
    return { ok: false, error: 'create_module benoetigt mindestens 1 body_block_id' }
  }

  const blocks: Blockly.BlockSvg[] = []
  for (const id of ids) {
    const block = requireBlock(workspace, id)
    if (!block) return { ok: false, error: `Block nicht gefunden: ${String(id)}` }
    blocks.push(block)
  }

  for (const block of blocks) block.unplug(true)
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].nextConnection?.connect(blocks[i + 1].previousConnection!)
  }

  const moduleBlock = workspace.newBlock('procedures_defnoreturn')
  moduleBlock.initSvg()
  moduleBlock.setFieldValue(name, 'NAME')
  moduleBlock.getInput('STACK')!.connection!.connect(blocks[0].previousConnection!)

  moduleBlock.render()
  await finishStep(moduleBlock)
  return { ok: true, block_id: moduleBlock.id }
}

/** Fasst frei stehende Bloecke als Rumpf einer os_for-Schleife zusammen -
 *  spiegelt createModule() fast 1:1, verbindet die Kette aber in DO statt
 *  STACK. var_name ist ein normaler, vom Modell gewaehlter String (KEINE
 *  Schritt-id aus resolveStepRefs) - die zugehoerige Blockly-Variable wird
 *  bei Bedarf angelegt (resolveVariableId ist idempotent), daher spielt die
 *  Reihenfolge zwischen diesem Schritt und einem frueheren Schritt, der
 *  dieselbe Variable per {op:"variable", name} referenziert, keine Rolle. */
async function createLoop(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const varName =
    typeof input.var_name === 'string' && input.var_name.trim() ? input.var_name.trim() : 'i'
  const ids = input.body_block_ids
  if (!Array.isArray(ids) || ids.length < 1) {
    return { ok: false, error: 'create_loop benoetigt mindestens 1 body_block_id' }
  }

  const blocks: Blockly.BlockSvg[] = []
  for (const id of ids) {
    const block = requireBlock(workspace, id)
    if (!block) return { ok: false, error: `Block nicht gefunden: ${String(id)}` }
    blocks.push(block)
  }

  for (const block of blocks) block.unplug(true)
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].nextConnection?.connect(blocks[i + 1].previousConnection!)
  }

  const loopBlock = workspace.newBlock('os_for')
  loopBlock.initSvg()
  loopBlock.setFieldValue(resolveVariableId(workspace, varName), 'VAR')
  setNumeric(workspace, loopBlock, 'FROM', toAgentNumericValue(input.from, 0))
  setNumeric(workspace, loopBlock, 'TO', toAgentNumericValue(input.to, 0))
  setNumeric(workspace, loopBlock, 'STEP', toAgentNumericValue(input.step, 1))
  if (typeof input.hull === 'boolean') {
    loopBlock.setFieldValue(input.hull ? 'TRUE' : 'FALSE', 'HUELLE')
  }
  loopBlock.getInput('DO')!.connection!.connect(blocks[0].previousConnection!)

  loopBlock.render()
  placeNewTopBlock(workspace, loopBlock)
  await finishStep(loopBlock)
  return { ok: true, block_id: loopBlock.id }
}

async function callModule(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : ''
  if (!name)
    return { ok: false, error: 'call_module benoetigt name (der Modulname aus create_module)' }

  // Erzeugt einen frei stehenden Aufruf-Block — genau wie add_primitive,
  // damit die zurueckgegebene block_id wie jede andere in wrap_transform/
  // combine weiterverwendet werden kann (z.B. den Aufruf an eine Position
  // verschieben). Ohne diesen Aufruf-Block bleibt ein per create_module
  // definiertes Modul in OpenSCAD wirkungslos, da es nie instanziiert wird.
  const block = workspace.newBlock('procedures_callnoreturn')
  block.initSvg()
  block.loadExtraState?.({ name })

  block.render()
  placeNewTopBlock(workspace, block)

  await finishStep(block)
  return { ok: true, block_id: block.id }
}

async function setField(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): Promise<AgentToolResult> {
  const block = requireBlock(workspace, input.block_id)
  if (!block) return { ok: false, error: `Block nicht gefunden: ${String(input.block_id)}` }

  const fieldName = String(input.field_name)

  if (block.getField(fieldName)) {
    block.setFieldValue(String(input.value), fieldName)
  } else if (block.getInput(fieldName)?.connection) {
    // Numerischer Value-Input (X/Y/Z/R/FROM/TO/...) statt eines echten
    // Felds - akzeptiert wie bei den anderen Werkzeugen entweder eine
    // reine Zahl oder einen Mathe-Ausdruck/Variablen-Verweis.
    setNumeric(workspace, block, fieldName, toAgentNumericValue(input.value, 0))
  } else {
    return { ok: false, error: `Feld/Eingang "${fieldName}" existiert nicht auf diesem Block.` }
  }

  await finishStep(block)
  return { ok: true, block_id: block.id }
}

function removeBlock(
  workspace: Blockly.WorkspaceSvg,
  input: Record<string, unknown>,
): AgentToolResult {
  const block = requireBlock(workspace, input.block_id)
  if (!block) return { ok: false, error: `Block nicht gefunden: ${String(input.block_id)}` }
  block.dispose(true)
  return { ok: true }
}

function getCurrentCode(workspace: Blockly.WorkspaceSvg): AgentToolResult {
  const { code, warnings } = generateCode(workspace)
  return { ok: true, data: { code, warnings } }
}

// Manche Modelle (bisher wiederholt bei ChatGPT beobachtet, seltener bei
// Claude) rufen statt "combine" mit input.type="union" einfach direkt ein
// Tool namens "union" auf - vermutlich verwechseln sie die in der
// Tool-Beschreibung genannten Parameter-WERTE (die OpenSCAD-Operationsnamen)
// mit eigenstaendigen Tool-NAMEN. Ein einzelner solcher Fehlgriff reisst
// wegen der Schritt-Referenzen (siehe resolveStepRefs) meist gleich mehrere
// nachfolgende Schritte mit (das Modul/der Aufruf, der auf das nie
// entstandene combine-Ergebnis verweist, schlaegt dann ebenfalls fehl).
// Statt das nur per Prompt zu erhoffen, werden die naheliegenden Aliasnamen
// hier deterministisch auf das echte Tool umgeleitet.
const TOOL_ALIASES: Record<string, { tool: string; type: string }> = {
  union: { tool: 'combine', type: 'union' },
  difference: { tool: 'combine', type: 'difference' },
  intersection: { tool: 'combine', type: 'intersection' },
  cube: { tool: 'add_primitive', type: 'cube' },
  sphere: { tool: 'add_primitive', type: 'sphere' },
  cylinder: { tool: 'add_primitive', type: 'cylinder' },
  translate: { tool: 'wrap_transform', type: 'translate' },
  rotate: { tool: 'wrap_transform', type: 'rotate' },
  scale: { tool: 'wrap_transform', type: 'scale' },
  color: { tool: 'wrap_transform', type: 'color' },
}

/** Fuehrt einen einzelnen Tool-Aufruf des Bau-Agenten gegen den echten
 *  Workspace aus. Faengt Fehler ab statt sie zu werfen — ein
 *  fehlgeschlagener Tool-Aufruf soll als tool_result mit is_error zurueck an
 *  Claude gehen (der Agent kann daraus lernen und einen anderen Ansatz
 *  versuchen), nicht den ganzen Bau-Vorgang abbrechen. */
export async function executeTool(
  workspace: Blockly.WorkspaceSvg,
  rawName: string,
  rawInput: Record<string, unknown>,
): Promise<AgentToolResult> {
  const alias = TOOL_ALIASES[rawName]
  const name = alias?.tool ?? rawName
  const input = alias ? { ...rawInput, type: rawInput.type ?? alias.type } : rawInput
  try {
    switch (name) {
      case 'add_primitive':
        return await addPrimitive(workspace, input)
      case 'wrap_transform':
        return await wrapTransform(workspace, input)
      case 'combine':
        return await combine(workspace, input)
      case 'create_module':
        return await createModule(workspace, input)
      case 'create_loop':
        return await createLoop(workspace, input)
      case 'call_module':
        return await callModule(workspace, input)
      case 'set_field':
        return await setField(workspace, input)
      case 'remove_block':
        return removeBlock(workspace, input)
      case 'get_current_code':
        return getCurrentCode(workspace)
      default:
        return { ok: false, error: `Unbekanntes Tool: ${name}` }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
