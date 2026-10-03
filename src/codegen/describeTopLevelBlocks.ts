import type { Workspace } from 'blockly'
import { generator } from './openscadGenerator'

export interface TopLevelBlockSummary {
  id: string
  preview: string
}

const MAX_PREVIEW_LENGTH = 160

/** Listet alle Top-Level-Bloecke des Workspace mit ihrer echten Blockly-
 *  block_id und einer kurzen Code-Vorschau auf - damit der KI-Bau-Agent bei
 *  einem Folgeauftrag ("faerbe den Hut ein") tatsaechlich VORHANDENE Objekte
 *  referenzieren kann. Der Bauplan entsteht in EINEM Aufruf (siehe
 *  agentClient.ts) und vergibt darin nur fuer NEU erzeugte Schritte eigene,
 *  im Plan eindeutige ids (siehe resolveStepRefs) - ohne diese Liste kennt
 *  das Modell keine echten block_ids fuer bereits gebaute Teile aus einem
 *  vorigen Bauvorgang und erfindet plausibel klingende, aber nicht
 *  existierende ids (z.B. "hat_base"), die bei der Ausfuehrung ins Leere
 *  laufen (workspace.getBlockById findet sie nicht). */
export function describeTopLevelBlocks(workspace: Workspace): TopLevelBlockSummary[] {
  generator.init(workspace)
  const summaries: TopLevelBlockSummary[] = []
  for (const block of workspace.getTopBlocks(true)) {
    if (block.outputConnection) continue
    const code = generator.blockToCode(block, true)
    const codeStr = (Array.isArray(code) ? code[0] : code).trim().replace(/\s+/g, ' ')
    if (!codeStr) continue
    const preview =
      codeStr.length > MAX_PREVIEW_LENGTH ? `${codeStr.slice(0, MAX_PREVIEW_LENGTH)}…` : codeStr
    summaries.push({ id: block.id, preview })
  }
  return summaries
}
