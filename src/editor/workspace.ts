import * as Blockly from 'blockly'
import { ScrollBlockDragger, ScrollMetricsManager } from '@blockly/plugin-scroll-options'
import { registerBlocks } from './blocks'
import { buildToolboxDefinition } from './toolbox'
import { applyBlocklyLocale } from '../i18n/blockly-locale'
import { getBlocklyTheme } from './blocklyThemes'
import { getBlockRenderer } from './blockRenderer'
import { getSoundEnabled } from './soundSetting'
import { getZoomScaleSpeed } from './zoomSpeedSetting'
import './blocklyMetallicRenderer'
import './blocklySteampunkRenderer'
import { getTheme, onThemeChange } from '../ui/theme'
import { setupZoomAndMinimap } from './minimap'
import { setupScrollOptions } from './scrollOptions'
import { applyCategoryTints } from './toolboxAppearance'
import { setupToolboxCollapse } from './toolboxCollapse'
import { installReadableBlockIds } from './readableIds'
import { installReadableVariableIds } from './readableVariableIds'
import { rerenderAllBlocks } from './rerenderAllBlocks'
import { registerVariablesFlyout } from './variablesFlyout'
import { registerProceduresFlyout } from './proceduresFlyout'
import { installPromoteEditedShadows } from './promoteEditedShadows'
import { installMutatorVariableCleanup } from './mutatorVariableCleanup'
import { installPasteRerenderFix } from './fixPasteRerender'
import { installPasteAtCursor } from './pasteAtCursor'
import { FixedScaleFlyout } from './fixedScaleFlyout'
import { saveWorkspaceState, loadWorkspaceState, clearWorkspaceState } from './workspaceStorage'
import { registerZoneColorMenu, collectCommentColors, restoreCommentColors, COMMENT_COLORS_KEY } from './commentColors'

const SAVE_DEBOUNCE_MS = 300

async function saveWorkspace(workspace: Blockly.WorkspaceSvg): Promise<void> {
  const state = Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>
  // Zonenfarben sind KEIN Teil von Blocklys eigenem Kommentar-Zustand (siehe
  // commentColors.ts) - separat mitsammeln, sonst gingen sie bei jedem
  // Autosave-Zyklus wieder verloren.
  state[COMMENT_COLORS_KEY] = collectCommentColors(workspace)
  try {
    await saveWorkspaceState(state)
  } catch (err) {
    // z.B. Privater Modus mit deaktivierter Speicherung o.ae. - Autosave
    // faellt dann einfach aus, statt mit einer ungefangenen Exception den
    // naechsten Speicherversuch (und damit alle folgenden) zu blockieren.
    console.warn('[editor] Autosave fehlgeschlagen:', err)
  }
}

/** Loescht alle Bloecke sowie den gesicherten Stand. */
export async function clearWorkspace(workspace: Blockly.Workspace): Promise<void> {
  workspace.clear()
  await clearWorkspaceState()
}

async function restoreWorkspace(workspace: Blockly.WorkspaceSvg): Promise<void> {
  let state: object | undefined
  try {
    state = await loadWorkspaceState()
  } catch (err) {
    console.warn('[editor] Konnte gespeicherten Workspace nicht laden:', err)
    return
  }
  if (!state) return
  try {
    Blockly.serialization.workspaces.load(state, workspace)
    rerenderAllBlocks(workspace)
    restoreCommentColors(workspace, state)
  } catch (err) {
    console.warn('[editor] Konnte gespeicherten Workspace nicht laden:', err)
  }
}

/** Injiziert den Blockly-Editor (Toolbox + Canvas) in `container` und richtet Autosave ein. */
export async function initEditor(container: HTMLElement): Promise<Blockly.WorkspaceSvg> {
  await applyBlocklyLocale()
  registerBlocks()
  // Blocklys eigene registerDefaultOptions() (intern beim Import von
  // 'blockly' aufgerufen) deckt NUR Workspace-/Block-Grundoptionen ab
  // (Undo, Redo, Aufraeumen, Loeschen, ...) - die Kommentar-Eintraege
  // ("Kommentar hinzufuegen" im Rechtsklick-Menue der Arbeitsflaeche sowie
  // Loeschen/Duplizieren auf einem Kommentar) muessen separat registriert
  // werden, sonst fehlt der Menuepunkt komplett.
  Blockly.ContextMenuItems.registerCommentOptions()
  // Zonenfarben: ein Menueeintrag pro Palettenfarbe im Rechtsklick-Menue
  // eines Kommentars (siehe commentColors.ts).
  registerZoneColorMenu()

  const workspace = Blockly.inject(container, {
    toolbox: buildToolboxDefinition(),
    trashcan: false,
    // Ueber das Menue waehlbar (siehe blockRenderer.ts/app.ts) - "geras" ist
    // Blocklys Standard-Renderer (klassischer, runder Scratch-Puzzleteil-
    // Look), "zelos" flacher/kantiger und wirkt weniger verspielt.
    renderer: getBlockRenderer(),
    // Eigener Zoom-/Minimap-Cluster ersetzt die eingebauten Zoom-Controls
    // (siehe setupZoomAndMinimap) — Mausrad-Zoom bleibt aktiv. scaleSpeed
    // ueber den Schieberegler im Cluster einstellbar (siehe
    // zoomSpeedSetting.ts) statt Blocklys ruppigem Standardwert von 1.2.
    zoom: { controls: false, wheel: true, scaleSpeed: getZoomScaleSpeed() },
    theme: getBlocklyTheme(getTheme()),
    // Fuer automatisches Scrollen beim Ziehen an den Rand noetig (siehe
    // setupScrollOptions) — @blockly/plugin-scroll-options ersetzt dafuer
    // Blocklys eigenen BlockDragger/MetricsManager. flyoutsVerticalToolbox
    // fixiert den Zoom der Toolbox-Bloecke unabhaengig vom Canvas-Zoom
    // (siehe fixedScaleFlyout.ts).
    plugins: {
      blockDragger: ScrollBlockDragger,
      metricsManager: ScrollMetricsManager,
      flyoutsVerticalToolbox: FixedScaleFlyout,
    },
  })

  workspace.getAudioManager().setMuted(!getSoundEnabled())
  installReadableBlockIds(workspace)
  installReadableVariableIds(workspace)
  registerVariablesFlyout(workspace)
  registerProceduresFlyout(workspace)
  installPromoteEditedShadows(workspace)
  installMutatorVariableCleanup(workspace)
  await restoreWorkspace(workspace)
  applyCategoryTints(workspace)
  onThemeChange((theme) => {
    workspace.setTheme(getBlocklyTheme(theme))
    // setTheme() rendert die Toolbox neu -- die vorher gesetzten
    // --cat-tint-Variablen sitzen dann auf inzwischen ersetzten DOM-Knoten.
    applyCategoryTints(workspace)
  })
  setupZoomAndMinimap(workspace)
  setupScrollOptions(workspace)
  setupToolboxCollapse(workspace)
  installPasteRerenderFix(workspace)
  installPasteAtCursor(workspace)

  // Blockly reagiert nicht von sich aus auf CSS-Layoutaenderungen seines
  // Containers (z.B. Popout-Toggle, Panel-Trenner ziehen) — nur explizite
  // resize()-Aufrufe (offizielle Empfehlung: window-Resize verdrahten; wir
  // beobachten hier direkt den Container, das deckt auch reine CSS-Aenderungen ab).
  new ResizeObserver(() => Blockly.svgResize(workspace)).observe(container)

  let saveTimeout: ReturnType<typeof setTimeout> | undefined
  function flushSave(): void {
    clearTimeout(saveTimeout)
    void saveWorkspace(workspace)
  }
  workspace.addChangeListener((event) => {
    if (event.isUiEvent) return
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  })

  // Ein schneller Reload/Tab-Schliessen kurz nach einer Aenderung darf den
  // 300ms-Debounce nicht abschneiden (sonst geht die letzte Aenderung
  // verloren) - beim Verlassen der Seite daher sofort synchron sichern.
  window.addEventListener('beforeunload', flushSave)
  window.addEventListener('pagehide', flushSave)

  return workspace
}
