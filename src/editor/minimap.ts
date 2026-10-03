import * as Blockly from 'blockly'
import { PositionedMinimap } from '@blockly/workspace-minimap'
import { WorkspaceSearch } from '@blockly/plugin-workspace-search'
import { t } from '../i18n'
import { getSoundEnabled, setSoundEnabled } from './soundSetting'
import { setZoomScaleSpeed, MIN_ZOOM_SCALE_SPEED, MAX_ZOOM_SCALE_SPEED } from './zoomSpeedSetting'

const BUTTON_SIZE = 28
const SPACING = 4
const MARGIN = 20
// Zoom-in, Minimap, Zoom-out, Reset stehen jeweils allein in einer Zeile;
// Suche und Alles-einpassen teilen sich eine Zeile nebeneinander, Ton
// und der Zoom-Geschwindigkeit-Regler (samt kleinem Tacho-Icon rechts davon)
// ebenfalls je eine eigene Zeile (siehe Konstruktor) — daher 7 Zeilen Hoehe.
const ROW_COUNT = 7
const CLUSTER_HEIGHT = ROW_COUNT * BUTTON_SIZE + (ROW_COUNT - 1) * SPACING
// Breiteste Zeile bestimmt die Cluster-Breite: normalerweise 2 Buttons
// (Suche + Alles-einpassen), die Zoom-Geschwindigkeit-Zeile (Regler + Icon)
// ist mit ZOOM_SPEED_ICON_SIZE noch etwas breiter.
const ZOOM_SPEED_SLIDER_WIDTH = 2 * BUTTON_SIZE + SPACING
const ZOOM_SPEED_ICON_SIZE = 16
const CLUSTER_WIDTH = ZOOM_SPEED_SLIDER_WIDTH + SPACING + ZOOM_SPEED_ICON_SIZE

// Lautsprecher-Symbol (Kegel + Schallwellen) statt Unicode-Emoji (🔊/🔇):
// Emoji rendern in ihrer eigenen, festen Farbe statt in der Button-Textfarbe
// und wirken dadurch bunt/inkonsistent neben den schlichten Schwarz-Weiss-
// Glyphen ("+", "−", "⊙", "?", "⛶") der uebrigen Cluster-Buttons. Eigenes
// SVG mit stroke/fill "currentColor" (gleiche Konvention wie MIC_ICON_SVG
// u.a. in viewerPanel.ts) faerbt sich stattdessen wie normaler Text.
const SOUND_ON_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" aria-hidden="true"><path d="M7.3 3.3L4 6H1.3v4H4l3.3 2.7V3.3Z" stroke-linejoin="round"/><path d="M10 5.3a4 4 0 0 1 0 5.4" fill="none" stroke-width="1.3" stroke-linecap="round"/><path d="M12 3.3a7 7 0 0 1 0 9.4" fill="none" stroke-width="1.3" stroke-linecap="round"/></svg>'
const SOUND_OFF_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" aria-hidden="true"><path d="M7.3 3.3L4 6H1.3v4H4l3.3 2.7V3.3Z" stroke-linejoin="round"/><line x1="10" y1="5.3" x2="14" y2="10.7" stroke-width="1.3" stroke-linecap="round"/><line x1="14" y1="5.3" x2="10" y2="10.7" stroke-width="1.3" stroke-linecap="round"/></svg>'

// Tacho-Symbol (Skala + Nadel) als rein dekorative Beschriftung rechts neben
// dem Zoom-Geschwindigkeit-Regler - der Regler selbst traegt bereits
// title/aria-label, das Icon ist daher aria-hidden.
const SPEED_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="9" r="6"/><path d="M8 9L11 5" stroke-linecap="round"/><circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none"/></svg>'

/**
 * `WorkspaceSearch` positioniert seine Suchleiste eigentlich fest in der dem
 * Toolbox-Rand gegenueberliegenden Ecke — hier stattdessen direkt links
 * neben dem "?"-Button im eigenen Icon-Cluster verankert. Der private
 * `htmlDiv`-Zugriff der Basisklasse ist von aussen nicht erreichbar, daher
 * wird das Element hier ueber seinen CSS-Klassennamen aus dem DOM geholt.
 * `open()`/`close()` werden ueberschrieben, damit der "?"-Button seinen
 * gedrueckt-Zustand auch dann synchron haelt, wenn die Suche auf einem
 * ANDEREN Weg geschlossen wird (Escape, eingebauter Schliessen-Button,
 * Strg+F erneut).
 */
class InlineWorkspaceSearch extends WorkspaceSearch {
  onVisibilityChange: ((visible: boolean) => void) | null = null
  // Eigene Kopie noetig: `workspace` ist in der Basisklasse `private`, von
  // hier aus also nicht erreichbar.
  private readonly ws: Blockly.WorkspaceSvg
  private readonly anchorButton: HTMLDivElement

  constructor(workspace: Blockly.WorkspaceSvg, anchorButton: HTMLDivElement) {
    super(workspace)
    this.ws = workspace
    this.anchorButton = anchorButton
    this.setSearchPlaceholder(t('search.placeholder'))
  }

  override position(): void {
    const el = this.ws.getInjectionDiv().querySelector<HTMLElement>('.blockly-ws-search')
    if (!el) return
    const anchorRect = this.anchorButton.getBoundingClientRect()
    const injectionRect = this.ws.getInjectionDiv().getBoundingClientRect()
    el.style.top = `${anchorRect.top - injectionRect.top}px`
    el.style.left = 'auto'
    el.style.right = `${injectionRect.right - anchorRect.left + SPACING}px`
  }

  override open(): void {
    super.open()
    this.onVisibilityChange?.(true)
  }

  override close(): void {
    super.close()
    this.onVisibilityChange?.(false)
  }
}

/**
 * `PositionedMinimap` spiegelt nur Aenderungen, die *nach* ihrer Erstellung
 * passieren (per Events) — bereits vorhandene Bloecke werden nicht
 * automatisch uebernommen. Dieser Wrapper kopiert den aktuellen Workspace-
 * Zustand einmalig beim Erstellen, damit sofort eine vollstaendige
 * Uebersicht zu sehen ist.
 */
class SyncedMinimap extends PositionedMinimap {
  constructor(workspace: Blockly.WorkspaceSvg) {
    super(workspace)
    // Muss vor super.init() gesetzt sein: init() loest darin bereits die
    // erste Positionierung aus (workspace.resize()), die den Wert sofort
    // liest. Mehr Abstand von oben, damit die Minimap nicht am oberen Rand
    // des Editor-Panels anstoesst/verdeckt wirkt.
    this.margin = 48
  }

  init(): void {
    super.init()
    if (this.minimapWorkspace) {
      const state = Blockly.serialization.workspaces.save(this.primaryWorkspace)
      Blockly.serialization.workspaces.load(state, this.minimapWorkspace)
      this.minimapWorkspace.zoomToFit()
    }
  }
}

function resetZoom(workspace: Blockly.WorkspaceSvg): void {
  workspace.markFocused()
  workspace.setScale(workspace.options.zoomOptions.startScale)
  workspace.scrollCenter()
}

/**
 * Ersetzt Blocklys eingebaute Zoom-Controls durch einen eigenen, einheitlich
 * gestalteten Icon-Cluster: Zoom-in, Minimap-Toggle, Zoom-out, Reset,
 * Suche, Alles-einpassen — in dieser Reihenfolge vertikal gestapelt
 * (Minimap-Icon mittig zwischen den Zoom-Buttons). "Alles einpassen" nutzt
 * Blocklys eigene workspace.zoomToFit(), "Suche" das offizielle
 * @blockly/plugin-workspace-search (siehe InlineWorkspaceSearch oben).
 * Nutzt dieselbe Eck-/Kollisionslogik wie Blocklys eigene Zoom-Controls
 * (selber Weight-Wert), damit es an derselben Stelle sitzt.
 */
class ZoomAndMinimapCluster implements Blockly.IPositionable {
  id = 'zoomAndMinimapCluster'
  private readonly workspace: Blockly.WorkspaceSvg
  private readonly container: HTMLDivElement
  private readonly minimapButton: HTMLDivElement
  private top = 0
  private left = 0
  private minimap: SyncedMinimap | null = null
  private search: InlineWorkspaceSearch | null = null
  private readonly soundButton: HTMLDivElement

  constructor(workspace: Blockly.WorkspaceSvg) {
    this.workspace = workspace
    this.container = document.createElement('div')
    this.container.className = 'bsn-zoom-cluster'

    const zoomInBtn = this.createButton('+', t('zoom.in'))
    zoomInBtn.addEventListener('click', () => {
      workspace.markFocused()
      workspace.zoomCenter(1)
    })

    this.minimapButton = this.createButton('🗺', t('minimap.toggle'))
    this.minimapButton.setAttribute('aria-pressed', 'false')
    this.minimapButton.addEventListener('click', () => this.toggleMinimap())

    const zoomOutBtn = this.createButton('−', t('zoom.out'))
    zoomOutBtn.addEventListener('click', () => {
      workspace.markFocused()
      workspace.zoomCenter(-1)
    })

    const resetBtn = this.createButton('⊙', t('zoom.reset'))
    resetBtn.addEventListener('click', () => resetZoom(workspace))

    const searchBtn = this.createButton('?', t('search.toggle'))
    searchBtn.setAttribute('aria-pressed', 'false')
    searchBtn.addEventListener('click', () => this.toggleSearch(searchBtn))

    const fitBtn = this.createButton('⛶', t('zoom.fit'))
    fitBtn.addEventListener('click', () => {
      workspace.markFocused()
      workspace.zoomToFit()
    })

    // Suche und Alles-einpassen als eine Zeile nebeneinander, Suche links.
    const searchFitRow = document.createElement('div')
    searchFitRow.className = 'bsn-zoom-row'
    searchFitRow.append(searchBtn, fitBtn)

    this.soundButton = this.createButton('', t('sound.toggle'))
    this.soundButton.setAttribute('aria-pressed', String(getSoundEnabled()))
    this.soundButton.addEventListener('click', () => this.toggleSound())
    this.updateSoundButtonLabel()

    // Mausrad-Zoom nutzt Blocklys eigenes scaleSpeed (siehe zoomSpeedSetting.ts)
    // - mit dem eingebauten Standard von 1.2 wirkt jeder Mausrad-Tick recht
    // ruppig/sprunghaft. Der Regler liest/schreibt scaleSpeed DIREKT auf
    // workspace.options.zoomOptions - Blockly liest den Wert bei jedem Zoom
    // live von dort, ein Neuladen ist also nicht noetig.
    const zoomSpeedInput = document.createElement('input')
    zoomSpeedInput.type = 'range'
    zoomSpeedInput.className = 'bsn-zoom-speed-slider'
    zoomSpeedInput.min = String(MIN_ZOOM_SCALE_SPEED)
    zoomSpeedInput.max = String(MAX_ZOOM_SCALE_SPEED)
    zoomSpeedInput.step = '0.01'
    zoomSpeedInput.value = String(workspace.options.zoomOptions.scaleSpeed)
    zoomSpeedInput.title = t('zoom.speed')
    zoomSpeedInput.setAttribute('aria-label', t('zoom.speed'))
    zoomSpeedInput.addEventListener('input', () => {
      const scaleSpeed = Number.parseFloat(zoomSpeedInput.value)
      workspace.options.zoomOptions.scaleSpeed = scaleSpeed
      setZoomScaleSpeed(scaleSpeed)
    })
    const zoomSpeedIcon = document.createElement('span')
    zoomSpeedIcon.className = 'bsn-zoom-speed-icon'
    zoomSpeedIcon.innerHTML = SPEED_ICON_SVG

    const zoomSpeedRow = document.createElement('div')
    zoomSpeedRow.className = 'bsn-zoom-row'
    zoomSpeedRow.title = t('zoom.speed')
    zoomSpeedRow.append(zoomSpeedInput, zoomSpeedIcon)

    this.container.append(
      zoomInBtn,
      this.minimapButton,
      zoomOutBtn,
      resetBtn,
      searchFitRow,
      this.soundButton,
      zoomSpeedRow,
    )
    workspace.getInjectionDiv().appendChild(this.container)
  }

  private createButton(label: string, title: string): HTMLDivElement {
    const btn = document.createElement('div')
    btn.className = 'bsn-zoom-btn'
    btn.title = title
    btn.setAttribute('role', 'button')
    btn.setAttribute('aria-label', title)
    btn.textContent = label
    return btn
  }

  private toggleMinimap(): void {
    if (this.minimap) {
      this.minimap.dispose()
      this.workspace.getComponentManager().removeComponent('minimap')
      this.minimap = null
      this.minimapButton.setAttribute('aria-pressed', 'false')
    } else {
      this.minimap = new SyncedMinimap(this.workspace)
      this.minimap.init()
      this.minimapButton.setAttribute('aria-pressed', 'true')
    }
  }

  private toggleSound(): void {
    const enabled = !getSoundEnabled()
    setSoundEnabled(enabled)
    this.workspace.getAudioManager().setMuted(!enabled)
    this.soundButton.setAttribute('aria-pressed', String(enabled))
    this.updateSoundButtonLabel()
  }

  private updateSoundButtonLabel(): void {
    this.soundButton.innerHTML = getSoundEnabled() ? SOUND_ON_ICON_SVG : SOUND_OFF_ICON_SVG
  }

  private toggleSearch(btn: HTMLDivElement): void {
    if (!this.search) {
      this.search = new InlineWorkspaceSearch(this.workspace, btn)
      this.search.init()
      this.search.onVisibilityChange = (visible) =>
        btn.setAttribute('aria-pressed', String(visible))
    }
    if (btn.getAttribute('aria-pressed') === 'true') {
      this.search.close()
    } else {
      this.search.open()
    }
  }

  init(): void {
    this.workspace.getComponentManager().addComponent({
      component: this,
      weight: Blockly.ComponentManager.ComponentWeight.ZOOM_CONTROLS_WEIGHT,
      capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE],
    })
    this.workspace.resize()
  }

  getBoundingRectangle(): Blockly.utils.Rect {
    return new Blockly.utils.Rect(
      this.top,
      this.top + CLUSTER_HEIGHT,
      this.left,
      this.left + CLUSTER_WIDTH,
    )
  }

  position(metrics: Blockly.MetricsManager.UiMetrics, savedPositions: Blockly.utils.Rect[]): void {
    const workspace = this.workspace
    const scrollbars = workspace.scrollbar
    const hasVerticalScrollbars = !!(
      scrollbars &&
      scrollbars.isVisible() &&
      scrollbars.canScrollVertically()
    )
    const hasHorizontalScrollbars = !!(
      scrollbars &&
      scrollbars.isVisible() &&
      scrollbars.canScrollHorizontally()
    )

    if (
      metrics.toolboxMetrics.position === Blockly.TOOLBOX_AT_LEFT ||
      (workspace.horizontalLayout && !workspace.RTL)
    ) {
      this.left = metrics.absoluteMetrics.left + metrics.viewMetrics.width - CLUSTER_WIDTH - MARGIN
      if (hasVerticalScrollbars && !workspace.RTL) this.left -= Blockly.Scrollbar.scrollbarThickness
    } else {
      this.left = MARGIN
      if (hasVerticalScrollbars && workspace.RTL) this.left += Blockly.Scrollbar.scrollbarThickness
    }

    const startAtBottom = metrics.toolboxMetrics.position === Blockly.TOOLBOX_AT_BOTTOM
    if (startAtBottom) {
      this.top = metrics.absoluteMetrics.top + MARGIN
    } else {
      this.top = metrics.absoluteMetrics.top + metrics.viewMetrics.height - CLUSTER_HEIGHT - MARGIN
      if (hasHorizontalScrollbars) this.top -= Blockly.Scrollbar.scrollbarThickness
    }

    let boundingRect = this.getBoundingRectangle()
    for (let i = 0; i < savedPositions.length; i++) {
      if (boundingRect.intersects(savedPositions[i])) {
        this.top = startAtBottom
          ? savedPositions[i].bottom + MARGIN
          : savedPositions[i].top - CLUSTER_HEIGHT - MARGIN
        boundingRect = this.getBoundingRectangle()
        i = -1
      }
    }

    this.container.style.top = `${this.top}px`
    this.container.style.left = `${this.left}px`
  }
}

/** Richtet den eigenen Zoom-/Minimap-Icon-Cluster im Workspace ein. */
export function setupZoomAndMinimap(workspace: Blockly.WorkspaceSvg): void {
  new ZoomAndMinimapCluster(workspace).init()
}
