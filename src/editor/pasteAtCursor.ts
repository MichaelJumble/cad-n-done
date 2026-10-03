import * as Blockly from 'blockly'

/**
 * Blockly platziert bei Strg+V eingefuegte Bloecke standardmaessig an einem
 * festen Versatz von der zuletzt kopierten Position (BlockPaster in Blockly
 * weicht bei Ueberlappung zusaetzlich per moveBlockToNotConflict aus) —
 * unabhaengig davon, wo der Mauszeiger gerade steht. Dadurch tauchen
 * eingefuegte Bloecke immer an derselben Stelle auf, auch wenn man vorher
 * an eine ganz andere Stelle im Workspace gezeigt hat.
 *
 * Dieser Fix merkt sich die letzte Mausposition ueber dem Workspace-SVG und
 * uebergibt sie beim Ausloesen des "paste"-Tastaturkuerzels als Zielposition
 * an Blockly.clipboard.paste() — der Block landet dann dort, wo der
 * Mauszeiger steht. Ohne bekannte Zeigerposition (z.B. rein
 * tastaturgesteuert) faellt das Verhalten auf Blocklys Standard zurueck.
 *
 * Das eingebaute "paste"-Tastaturkuerzel ruft dabei NICHT die oeffentliche
 * Funktion Blockly.clipboard.paste() auf (dieselbe Art von interner
 * Direktreferenz wie beim "Duplicate"-Kontextmenue, siehe
 * fixPasteRerender.ts) — deshalb wird hier stattdessen der
 * ShortcutRegistry-Eintrag "paste" selbst umschlossen.
 */
export function installPasteAtCursor(workspace: Blockly.WorkspaceSvg): void {
  let lastPointer: Blockly.utils.Coordinate | null = null
  workspace.getParentSvg().addEventListener('mousemove', (event: MouseEvent) => {
    lastPointer = new Blockly.utils.Coordinate(event.clientX, event.clientY)
  })

  const registry = Blockly.ShortcutRegistry.registry
  const pasteShortcut = registry.getRegistry()['paste']
  const originalCallback = pasteShortcut?.callback
  if (!pasteShortcut || !originalCallback) return

  // unregister() entfernt auch die Tastenkombinations-Zuordnung (keyCodes)
  // der alten Registrierung — ohne das wuerde die anschliessende
  // Neu-Registrierung mit denselben keyCodes mit "collides with shortcut"
  // fehlschlagen, da dieselbe Taste sonst doppelt zugeordnet waere.
  registry.unregister('paste')
  registry.register({
    ...pasteShortcut,
    callback: (ws, event, shortcut, scope) => {
      const copyData = Blockly.clipboard.getLastCopiedData()
      const copyWorkspace = Blockly.clipboard.getLastCopiedWorkspace()
      if (lastPointer && copyData && copyWorkspace) {
        const target = Blockly.utils.svgMath.screenToWsCoordinates(copyWorkspace, lastPointer)
        return !!Blockly.clipboard.paste(copyData, copyWorkspace, target)
      }
      return originalCallback(ws, event, shortcut, scope)
    },
  })
}
