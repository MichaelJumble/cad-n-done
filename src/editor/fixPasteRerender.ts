import * as Blockly from 'blockly'
import { rerenderBlockSubtree } from './rerenderAllBlocks'

async function scheduleRerender(root: Blockly.Block): Promise<void> {
  await Blockly.renderManagement.finishQueuedRenders()
  rerenderBlockSubtree(root)
}

/** Nach dem Einfuegen (Strg+V) oder Duplizieren (Kontextmenue "Duplicate")
 *  eines Blocks mit dynamischen "+"/"-"-Mutator-Eingaengen (verschieben,
 *  drehen, farbe, ...), oder eines Moduls mit verschachtelten Kind-
 *  Bloecken, zeigte Blockly manche Werte/Eingaenge zunaechst nicht korrekt
 *  an, obwohl der kopierte Zustand (extraState/Feldwerte) vollstaendig
 *  korrekt war — dieselbe Layout-Stale-Bug-Klasse wie beim Laden aus
 *  Datei/localStorage (siehe rerenderAllBlocks.ts), hier aber ueber
 *  Blocklys eigene Copy/Paste-Pfade ausgeloest, die bisher nie einen
 *  erzwungenen Re-Render durchliefen. Ein Reload (das ueber
 *  restoreWorkspace() immer rerenderAllBlocks aufruft) zeigte daher
 *  korrekt alle Werte, das frische Einfuegen/Duplizieren nicht.
 *
 *  WICHTIG: Das Kontextmenue "Duplicate" ruft NICHT Blockly.clipboard.paste()
 *  auf (per Instrumentierung verifiziert: beim Klick auf "Duplicate" feuert
 *  ein Hook auf Blockly.clipboard.paste NIE) — es hat einen eigenen,
 *  separat registrierten ContextMenuRegistry-Eintrag ("blockDuplicate" in
 *  contextmenu_items.ts), der Copy+Paste intern anders verdrahtet. Deshalb
 *  muss dieser Eintrag direkt umschlossen werden statt (nur) clipboard.paste
 *  zu patchen. Blockly.clipboard.paste wird zusaetzlich weiterhin gepatcht,
 *  um jeglichen Aufrufercode abzudecken, der die dokumentierte
 *  Erweiterungs-API direkt nutzt — u.a. pasteAtCursor.ts, das darueber
 *  Strg+V mit einer expliziten Zielposition (Mauszeiger) ausloest, da auch
 *  das eingebaute "paste"-Tastaturkuerzel NICHT ueber diese oeffentliche
 *  Funktion laeuft.
 *
 *  Bei groesseren/tiefer verschachtelten eingefuegten Baeumen (z.B. ein
 *  dupliziertes Modul mit mehreren Ebenen) reicht ein SOFORTIGER
 *  rerender-Aufruf allein nicht: Blockly 12 rendert ueber eine interne
 *  Warteschlange (Blockly.renderManagement), die zum Zeitpunkt des
 *  Callback-Rueckgabewerts noch nicht zwingend durchgelaufen ist - ohne
 *  vorheriges Abwarten von finishQueuedRenders() blieben tiefer
 *  verschachtelte Zahlenfelder trotzdem leer. Laeuft bewusst asynchron NACH
 *  der eigentlichen (synchronen) Aktion, um deren Signatur/Zeitverhalten
 *  fuer andere Aufrufer nicht zu veraendern.
 *
 *  WICHTIG (Z-Order-Bug): Der Re-Render darf NUR den neu eingefuegten
 *  Block-Baum betreffen (rerenderBlockSubtree), NICHT den gesamten
 *  Workspace (rerenderAllBlocks) — block.render() haengt den Block dabei
 *  intern neu ins SVG-DOM ein und veraendert damit seine Zeichenreihenfolge.
 *  Ein Re-Render des kompletten Workspace nach jedem Duplizieren hat genau
 *  deshalb bereits einmal dazu gefuehrt, dass unbeteiligte, bereits
 *  vorhandene Bloecke ploetzlich hinter dem neuen Duplikat verschwanden. */
export function installPasteRerenderFix(workspace: Blockly.WorkspaceSvg): void {
  const originalPaste = Blockly.clipboard.paste
  Blockly.clipboard.paste = ((...args: Parameters<typeof Blockly.clipboard.paste>) => {
    const result = originalPaste(...args)
    if (result instanceof Blockly.BlockSvg) void scheduleRerender(result)
    return result
  }) as typeof Blockly.clipboard.paste

  const registry = Blockly.ContextMenuRegistry.registry
  const duplicateItem = registry.getItem('blockDuplicate')
  if (duplicateItem && !duplicateItem.separator) {
    const originalCallback = duplicateItem.callback
    const wrappedCallback: typeof originalCallback = (
      scope,
      menuOpenEvent,
      menuSelectEvent,
      location,
    ) => {
      const before = new Set(workspace.getTopBlocks(false).map((block) => block.id))
      originalCallback(scope, menuOpenEvent, menuSelectEvent, location)
      const newTopBlocks = workspace.getTopBlocks(false).filter((block) => !before.has(block.id))
      for (const block of newTopBlocks) void scheduleRerender(block)
    }
    registry.unregister('blockDuplicate')
    registry.register({ ...duplicateItem, callback: wrappedCallback })
  }
}
