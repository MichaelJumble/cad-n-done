import type { WorkspaceSvg } from 'blockly'
import { ScrollOptions } from '@blockly/plugin-scroll-options'

/** Aktiviert automatisches Scrollen, wenn ein Block beim Ziehen an den Rand
 *  des sichtbaren Workspace-Bereichs gefuehrt wird (@blockly/plugin-scroll-
 *  options — Blockly.inject() braucht dafuer bereits die passenden
 *  blockDragger-/metricsManager-Plugins, siehe workspace.ts). Mausrad-
 *  Scrollen waehrend des Ziehens bleibt bewusst aus, da das mit dem
 *  bestehenden "Mausrad zoomt"-Verhalten (zoom.wheel) kollidieren wuerde. */
export function setupScrollOptions(workspace: WorkspaceSvg): void {
  new ScrollOptions(workspace).init({ enableWheelScroll: false, enableEdgeScroll: true })
}
