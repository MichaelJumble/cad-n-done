import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import { createProjectFilePicker } from './projectFilePicker'
import { rerenderAllBlocks } from '../editor'

interface ImportedVariable {
  id: string
  name: string
  type?: string
}

/** Findet den ersten freien Namen fuer eine importierte Variable: `name`
 *  selbst, falls im Ziel-Workspace noch nicht vergeben, sonst `name1`,
 *  `name2`, ... — die naechste noch freie Zahl. */
function findAvailableVariableName(workspace: WorkspaceSvg, name: string, type: string): string {
  const variableMap = workspace.getVariableMap()
  if (!variableMap.getVariable(name, type)) return name
  let suffix = 1
  while (variableMap.getVariable(`${name}${suffix}`, type)) suffix++
  return `${name}${suffix}`
}

/** Bestimmt fuer jede importierte Variable die ID, die im Ziel-Workspace
 *  verwendet werden soll. Bereits im Ziel-Workspace vorhandene Variablen
 *  werden dabei NICHT angetastet/wiederverwendet — kollidiert der Name
 *  einer importierten Variable mit einer bestehenden, wird die importierte
 *  stattdessen umbenannt (name -> name1 -> name2 -> ...), damit bestehende
 *  Bloecke garantiert weiter auf ihre urspruengliche Variable zeigen. */
function resolveVariableIdMap(
  workspace: WorkspaceSvg,
  importedVariables: ImportedVariable[],
): Map<string, string> {
  const idMap = new Map<string, string>()
  const variableMap = workspace.getVariableMap()
  for (const variable of importedVariables) {
    const type = variable.type ?? ''
    const name = findAvailableVariableName(workspace, variable.name, type)
    const created = variableMap.createVariable(name, type)
    idMap.set(variable.id, created.getId())
  }
  return idMap
}

/** Ersetzt rekursiv jede "id", die als importierte Variablen-ID bekannt
 *  ist, durch die im Ziel-Workspace aufgeloeste ID (z.B. in
 *  fields.VAR.id) — laesst alle anderen IDs (Block-IDs) unangetastet, da
 *  Block- und Variablen-IDs unterschiedliche Namensraeume sind und sich
 *  nicht ueberschneiden. */
function remapVariableReferences(node: unknown, idMap: Map<string, string>): void {
  if (Array.isArray(node)) {
    for (const item of node) remapVariableReferences(item, idMap)
    return
  }
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (typeof obj.id === 'string' && idMap.has(obj.id)) {
    obj.id = idMap.get(obj.id)
  }
  for (const value of Object.values(obj)) remapVariableReferences(value, idMap)
}

/** Baut den "Importieren"-Ablauf: Dateiauswahl -> Parsen/Validieren -> die
 *  darin enthaltenen Bloecke werden dem BESTEHENDEN Design hinzugefuegt.
 *
 *  Blockly.serialization.workspaces.load() leert den Ziel-Workspace trotz
 *  gegenteiliger Doku-Aussage ("add the new state to") empirisch IMMER
 *  zuerst (verifiziert) — fuer echtes Hinzufuegen ohne den Rest zu loeschen
 *  wird daher jeder Top-Level-Block einzeln per
 *  Blockly.serialization.blocks.append() eingefuegt statt den ganzen
 *  Workspace-Zustand auf einmal zu laden. Variablen-Referenzen in den
 *  importierten Bloecken zeigen dabei auf Variablen-IDs aus der QUELL-Datei,
 *  die im Ziel-Workspace nicht existieren — ohne Remapping wuerde Blockly
 *  das still auf eine falsche/automatisch angelegte Variable umbiegen
 *  (leise falsches Ergebnis, kein Fehler) — daher werden Variablen zuerst
 *  aufgeloest/angelegt (bei Namenskollision umbenannt, siehe
 *  findAvailableVariableName) und alle Referenzen entsprechend umgeschrieben.
 *
 *  Keine Bestaetigung noetig (anders als bei "Laden"), da nichts geloescht
 *  wird. Als eigener Undo-Schritt aufgezeichnet, damit ein versehentlicher
 *  Import per Strg+Z rueckgaengig gemacht werden kann. */
export function wireImportProject(workspace: WorkspaceSvg, triggerBtn: HTMLButtonElement): void {
  const pickFile = createProjectFilePicker((state) => {
    const typedState = state as { blocks?: { blocks?: unknown[] }; variables?: ImportedVariable[] }
    const idMap = resolveVariableIdMap(workspace, typedState.variables ?? [])

    for (const blockState of typedState.blocks?.blocks ?? []) {
      remapVariableReferences(blockState, idMap)
      Blockly.serialization.blocks.append(
        blockState as Parameters<typeof Blockly.serialization.blocks.append>[0],
        workspace,
        { recordUndo: true },
      )
    }
    rerenderAllBlocks(workspace)
  })

  triggerBtn.addEventListener('click', pickFile)
}
