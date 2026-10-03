import * as Blockly from 'blockly'
import { rerenderBlockSubtree } from './rerenderAllBlocks'

/** Achsen-Feldname des os_translate-Blocks fuer eine Ausrichtungs-Achse. */
const AXIS_FIELD: Record<'x' | 'y' | 'z', 'X' | 'Y' | 'Z'> = { x: 'X', y: 'Y', z: 'Z' }

// Unterhalb dieser Differenz gilt ein Objekt bereits als ausgerichtet - kein
// Leerlauf-Korrekturblock (verschieben um praktisch 0) einfuegen.
const EPSILON = 1e-6

/** Fuegt einen neuen `verschieben`(os_translate)-Korrektur-Block VOR dem
 *  angegebenen Block ein, der ihn (und seine evtl. folgende Kette) exakt um
 *  `delta` entlang `axis` verschiebt - fuer das Ausrichten-Werkzeug im
 *  Viewer (siehe viewerPanel.ts). Ueberschreibt bewusst NICHT die
 *  bestehenden X/Y/Z-Werte des Ziel-Blocks (die koennen komplexe Ausdruecke/
 *  Variablen sein, siehe z.B. eine parametrische Vase mit `verschieben` per
 *  Schleifenvariable) - der Korrektur-Offset kommt immer als zusaetzlicher,
 *  rein literaler Wrapper obendrauf, exakt nach dem Muster von
 *  `wrapTransform()` in `src/agent/toolExecutor.ts` (dort fuer das
 *  KI-Agent-Werkzeug "Objekt einhuellen"). Kein Code-Sharing mit dem Agent-
 *  Modul, um dessen Subsystem nicht anzufassen - nur eine kleinere, auf
 *  diesen Anwendungsfall zugeschnittene Kopie des Musters. */
export function alignBlockByDelta(
  workspace: Blockly.WorkspaceSvg,
  blockId: string,
  axis: 'x' | 'y' | 'z',
  delta: number,
): void {
  if (Math.abs(delta) < EPSILON) return

  const child = workspace.getBlockById(blockId) as Blockly.BlockSvg | null
  if (!child) return

  Blockly.Events.setGroup(true)
  try {
    // Zielort merken, BEVOR der Block geloest wird: unplug(true) heilt die
    // Luecke in der bisherigen Kette automatisch - der neue Korrektur-Block
    // soll danach genau diese freigewordene Stelle einnehmen.
    const oldParentConn = child.previousConnection?.targetConnection ?? null
    const oldXY = child.getRelativeToSurfaceXY()
    child.unplug(true)

    const wrapper = workspace.newBlock('os_translate') as Blockly.BlockSvg
    wrapper.initSvg()
    wrapper.loadExtraState?.({ operandCount: 1 })
    // Nur die Ziel-Achse bekommt den literalen Offset - die anderen beiden
    // behalten ihren Standard-Shadow (0,0,0 aus os_translate_defaults).
    wrapper.getInput(AXIS_FIELD[axis])!.connection!.setShadowState({
      type: 'math_number',
      fields: { NUM: delta },
    })

    if (oldParentConn) {
      oldParentConn.connect(wrapper.previousConnection!)
    } else {
      wrapper.moveBy(oldXY.x, oldXY.y)
    }
    wrapper.getInput('DO0')!.connection!.connect(child.previousConnection!)

    wrapper.render()
    const root = oldParentConn ? oldParentConn.getSourceBlock() : wrapper
    rerenderBlockSubtree(root)
  } finally {
    Blockly.Events.setGroup(false)
  }
}
