import type { Block, Workspace } from 'blockly'

// Blocklys eingebaute Prozeduren-Bloecke bringen getProcedureDef()/
// getProcedureCall()/getVars() mit (siehe core/interfaces/i_legacy_procedure_blocks
// — intern, daher hier minimal nachgebildet, analog zu
// codegen/blocks/procedures.ts und codegen/colorFragments.ts).
interface ProcedureDefBlock extends Block {
  getProcedureDef(): [name: string, params: string[], hasReturn: boolean]
}
interface ProcedureCallBlock extends Block {
  getProcedureCall(): string
  /** Parameter-NAMEN in ARG-Index-Reihenfolge (ARG0, ARG1, ...) - vom
   *  Prozeduren-System selbst synchron zur Moduldefinition gehalten. */
  getVars(): string[]
}

export type CustomizerFieldType = 'NUMBER' | 'TEXT' | 'BOOLEAN'

const CUSTOMIZER_BLOCK_TYPES: Record<string, CustomizerFieldType> = {
  os_customizer_number: 'NUMBER',
  os_customizer_text: 'TEXT',
  os_customizer_boolean: 'BOOLEAN',
}

interface CustomizerFieldMeta {
  paramName: string
  description: string
  type: CustomizerFieldType
  min?: number
  max?: number
}

export interface CustomizerCallField extends CustomizerFieldMeta {
  /** id des Literal-Blocks, der den aktuellen Wert traegt (math_number/text/
   *  logic_boolean) - null, wenn der Aufruf-Slot leer ist oder kein
   *  einfacher Literal-Block (z.B. ein Ausdruck/eine Variable) und daher
   *  hier nicht sicher bearbeitbar ist. */
  literalBlockId: string | null
  currentValue: number | string | boolean | null
}

export interface CustomizerCall {
  callBlockId: string
  /** Kurzbezeichner fuer die Anzeige, falls dasselbe Modul mehrfach
   *  aufgerufen wird (z.B. "Aufruf 1", "Aufruf 2", ...). */
  label: string
  fields: CustomizerCallField[]
}

export interface CustomizerModule {
  moduleName: string
  /** Zusammengefuegter Text aller REM-Bloecke (os_comment) im Modul, oder
   *  null, wenn das Modul keinen hat. */
  comment: string | null
  calls: CustomizerCall[]
}

function readLiteralNumber(block: Block, inputName: string): number | null {
  const target = block.getInputTargetBlock(inputName)
  if (!target || target.type !== 'math_number') return null
  const raw = target.getFieldValue('NUM')
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
  return Number.isFinite(value) ? value : null
}

/** Liest die os_customizer_*-Markierungen direkt im STACK einer
 *  Moduldefinition (keine tiefere Rekursion — Markierungen in verschachtelten
 *  Bloecken innerhalb des Moduls waeren fuer den Nutzer ohnehin schwer
 *  einem Top-Level-Parameter zuzuordnen). */
function collectFieldMeta(defBlock: Block): Map<string, CustomizerFieldMeta> {
  const meta = new Map<string, CustomizerFieldMeta>()
  let block = defBlock.getInputTargetBlock('STACK')
  while (block) {
    const type = CUSTOMIZER_BLOCK_TYPES[block.type]
    if (type && block.isEnabled()) {
      const paramName = block.getField('VAR')?.getText() ?? ''
      const description = String(block.getFieldValue('DESCRIPTION') ?? '')
      if (paramName) {
        const entry: CustomizerFieldMeta = { paramName, description, type }
        if (type === 'NUMBER') {
          entry.min = readLiteralNumber(block, 'MIN') ?? 0
          entry.max = readLiteralNumber(block, 'MAX') ?? 100
        }
        meta.set(paramName, entry)
      }
    }
    block = block.getNextBlock()
  }
  return meta
}

/** Liest alle REM-Kommentare (os_comment) direkt im STACK einer
 *  Moduldefinition, analog zu collectFieldMeta - dienen dort als kurze
 *  Beschreibung des Moduls fuer den Endnutzer im Anpass-Overlay (siehe
 *  ui/customizerBody.ts). Mehrere REM-Bloecke werden zeilenweise
 *  zusammengefuegt; keiner vorhanden -> null (dann wird nichts angezeigt). */
function collectModuleComment(defBlock: Block): string | null {
  const lines: string[] = []
  let block = defBlock.getInputTargetBlock('STACK')
  while (block) {
    if (block.type === 'os_comment' && block.isEnabled()) {
      const text = String(block.getFieldValue('TEXT') ?? '').trim()
      if (text) lines.push(text)
    }
    block = block.getNextBlock()
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/** Liest den aktuellen Wert (und dessen Block-id, fuer spaeteres
 *  Zurueckschreiben) an einem ARG-Eingang eines Aufrufs, sofern dort ein
 *  einfacher, zum erwarteten Typ passender Literal-Block haengt. */
function readArgValue(
  call: Block,
  index: number,
  type: CustomizerFieldType,
): { literalBlockId: string | null; currentValue: CustomizerCallField['currentValue'] } {
  const target = call.getInputTargetBlock(`ARG${index}`)
  if (!target) return { literalBlockId: null, currentValue: null }
  if (type === 'NUMBER' && target.type === 'math_number') {
    const raw = target.getFieldValue('NUM')
    const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
    return { literalBlockId: target.id, currentValue: Number.isFinite(value) ? value : null }
  }
  if (type === 'TEXT' && target.type === 'text') {
    return { literalBlockId: target.id, currentValue: String(target.getFieldValue('TEXT') ?? '') }
  }
  if (type === 'BOOLEAN' && target.type === 'logic_boolean') {
    return { literalBlockId: target.id, currentValue: target.getFieldValue('BOOL') === 'TRUE' }
  }
  // Ausdruck/Variable statt Literal - nicht sicher bearbeitbar, wird vom
  // Aufrufer uebersprungen statt geraten.
  return { literalBlockId: null, currentValue: null }
}

/** Durchsucht den gesamten Workspace nach Modulen mit os_customizer_*-
 *  Markierungen und allen Aufrufen dieser Module — Grundlage fuer das
 *  Anpass-Overlay (siehe ui/customizerBody.ts). Ein Modul ohne jegliche
 *  Markierung oder ohne (bearbeitbaren) Aufruf taucht gar nicht erst auf. */
export function collectCustomizerModules(workspace: Workspace): CustomizerModule[] {
  const allBlocks = workspace.getAllBlocks(false)
  const definitions = allBlocks.filter((b) => b.type === 'procedures_defnoreturn')
  const calls = allBlocks.filter((b) => b.type === 'procedures_callnoreturn')

  const modules: CustomizerModule[] = []
  for (const def of definitions) {
    const [moduleName] = (def as ProcedureDefBlock).getProcedureDef()
    const fieldMeta = collectFieldMeta(def)
    if (fieldMeta.size === 0) continue

    const matchingCalls = calls.filter(
      (call) => (call as ProcedureCallBlock).getProcedureCall() === moduleName,
    )
    const moduleCalls: CustomizerCall[] = []
    matchingCalls.forEach((call, callIndex) => {
      const paramNames = (call as ProcedureCallBlock).getVars()
      const fields: CustomizerCallField[] = []
      paramNames.forEach((paramName, argIndex) => {
        const meta = fieldMeta.get(paramName)
        if (!meta) return
        const { literalBlockId, currentValue } = readArgValue(call, argIndex, meta.type)
        if (literalBlockId === null) return
        fields.push({ ...meta, literalBlockId, currentValue })
      })
      if (fields.length > 0) {
        moduleCalls.push({
          callBlockId: call.id,
          label: matchingCalls.length > 1 ? `#${callIndex + 1}` : '',
          fields,
        })
      }
    })

    // Nur anzeigen, wenn es auch mindestens einen bearbeitbaren Aufruf gibt -
    // ohne Aufruf gibt es keinen Literal-Wert, in den ein Regler schreiben
    // koennte, ein Modul-Eintrag ohne jegliche Felder waere nur eine leere
    // Ueberschrift ohne Nutzen.
    if (moduleCalls.length > 0) {
      modules.push({ moduleName, comment: collectModuleComment(def), calls: moduleCalls })
    }
  }
  return modules
}
