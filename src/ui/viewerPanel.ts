import * as Blockly from 'blockly'
import type { WorkspaceSvg } from 'blockly'
import {
  generateColorFragments,
  collectSvgAssets,
  collectStlAssets,
  type RenderFragment,
} from '../codegen'
import { createRenderClient } from '../render'
import {
  createViewer,
  type ViewPreset,
  type ColorFilter,
  type MeasureStatus,
  type MeasureMode,
  type ClipAxis,
  collectPhotoProjections,
} from '../viewer'
import { alignBlockByDelta } from '../editor/alignBlocks'
import { t } from '../i18n'
import { getProjectName } from './projectName'
import { mountRecordingDialog } from './recordingDialog'
import { buildCustomizerBodyHtml, wireCustomizerBody } from './customizerBody'
import { placeNewBlock } from './placeNewBlock'
import { uint8ArrayToBase64 } from '../base64'
import type { ImportStlState } from '../editor/blocks/stl'
import type { PopoutHandle } from './popout'
import type { RenderCodeFragment, RenderedFragment, RenderSvgAsset, RenderStlAsset } from '../types'

const DEFAULT_COLOR_OPTION_VALUE = '__default__'
// Ab wie vielen betroffenen Farbpaaren die Kollisions-Statuszeile nur noch
// die ersten paar einzeln nennt und den Rest zusammenfasst (siehe
// checkCollisions()) - reine Lesbarkeitsgrenze fuer den Text, im Viewer
// blinken weiterhin ALLE gefundenen Ueberschneidungen.
const MAX_COLLISION_PAIR_LABELS = 4
// Hoehe, mit der eine reine 2D-Flaeche NUR fuers Rendern extrudiert wird
// (siehe triggerRender()/render/worker.ts) - analog zu OpenSCAD/BlockSCAD,
// die 2D-Entwuerfe ebenfalls automatisch minimal "aufblasen", statt gar
// nichts anzuzeigen. Rein kosmetisch, geht nie in den generierten/
// exportierten Code ein.
const PREVIEW_2D_HEIGHT_MM = 0.1

function sanitizeFilenamePart(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]+/g, '_')
  return cleaned || t('project.default_name')
}

// Projektname + Zaehler wie beim Speichern des Designs (siehe saveProject.ts) —
// so lassen sich Screenshot/Bild-Export einem Projektstand zuordnen.
function buildImageFilename(): string {
  const counterValue = document.querySelector<HTMLInputElement>('#counter-value')?.value ?? '000'
  return `${sanitizeFilenamePart(getProjectName())}_${counterValue}.png`
}

function buildModelFilename(extension: string): string {
  const counterValue = document.querySelector<HTMLInputElement>('#counter-value')?.value ?? '000'
  return `${sanitizeFilenamePart(getProjectName())}_${counterValue}.${extension}`
}

export function buildRecordingFilename(suffix = ''): string {
  const counterValue = document.querySelector<HTMLInputElement>('#counter-value')?.value ?? '000'
  return `${sanitizeFilenamePart(getProjectName())}_${counterValue}${suffix}.webm`
}

// Unicode-Kandidaten fuers Fenster-mit-Pfeil-Icon rendern in manchen
// Umgebungen als Tofu-Box (siehe Kopieren-Button im Code-Panel) — deshalb
// hier Inline-SVGs statt Textzeichen. Zwei Varianten: Pfeil zeigt nach
// aussen (auslagern) bzw. nach innen (wieder einbetten) — derselbe
// Kasten, nur die Pfeilrichtung/Ecke des Hakens wechselt, damit auf einen
// Blick erkennbar ist, was ein Klick als naechstes tut.
const POPOUT_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/><path d="M9 2h5v5"/><path d="M14 2L7 9"/></svg>'
const EMBED_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/><path d="M8 3v4h4"/><path d="M14 1L8 7"/></svg>'
// Gleiche Begruendung wie oben (Unicode-Tofu-Risiko) — Videokamera-Symbol
// (Gehaeuse + seitliches Objektiv-Dreieck, wie ueblich fuer "Aufnahme") fuer
// den Aufnahme-Button. Der Stopp-Zustand bleibt ein simples Unicode-Quadrat
// (■), das zuverlaessig als schlichtes Glyph darstellt.
export const CAMERA_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3.3" width="10" height="9.3" rx="1.3"/><path d="M15 4.7L10.5 8L15 11.3V4.7Z"/></svg>'
// Fuer den pausierten Zustand (siehe record-pause-btn/record-tab-pause-btn):
// ein simples "▶" allein wurde als Play-Button (weiterspielen/abspielen)
// missverstanden - ein rotes Dreieck MIT Strich darunter macht stattdessen
// eindeutig "Aufnahme fortsetzen" klar (angelehnt an aehnliche Icons in
// Aufnahme-Software). Farbe direkt in fill/style statt currentColor, da der
// Knopf selbst (anders als der Aufnahme-Knopf) keine eigene rote
// [aria-pressed]-Farbregel hat.
export const RECORD_RESUME_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5L13 8L4 13.5Z" style="fill:var(--color-danger, #c0392b)"/><rect x="3" y="14.2" width="10" height="1.6" rx="0.8" style="fill:var(--color-danger, #c0392b)"/></svg>'
// Mikrofon-Umschalter neben dem Aufnahme-Knopf (siehe record-mic-btn/
// record-tab-mic-btn) - dasselbe Icon fuer an/aus, die aktive Faerbung
// kommt ueber die generische [aria-pressed='true']-Regel in layout.css
// (gleiche Konvention wie Drahtgitter/Messen/Zeiger-Umschalter).
export const MIC_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="1.3" width="4" height="7.4" rx="2"/><path d="M3.3 7.5a4.7 4.7 0 0 0 9.4 0"/><line x1="8" y1="12.2" x2="8" y2="14.5"/><line x1="5.3" y1="14.5" x2="10.7" y2="14.5"/></svg>'
// Zentrales Kaestchen (der zusammengesetzte Zustand) mit vier auseinander-
// fliegenden Fragmenten in den Ecken - der bisherige Unicode-Stern (✳) wurde
// zu leicht mit einem echten Stern-Icon verwechselt, ein eigenes SVG macht
// das "Auseinanderziehen" eindeutiger erkennbar.
const EXPLOSION_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="M6.3 6.3L2.3 2.3M9.7 6.3L13.7 2.3M6.3 9.7L2.3 13.7M9.7 9.7L13.7 13.7"/><rect x="6" y="6" width="4" height="4"/><rect x="1" y="1" width="2" height="2"/><rect x="13" y="1" width="2" height="2"/><rect x="1" y="13" width="2" height="2"/><rect x="13" y="13" width="2" height="2"/></svg>'
// Drei waagrechte Schieberegler (klassisches "Einstellungen"-Symbol) fuer
// den Customizer-Overlay-Button - Unicode-Kandidaten (⚙/🎚) sind wieder das
// bekannte Tofu-Risiko, siehe Begruendung bei den anderen Icons oben.
const CUSTOMIZER_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><line x1="1" y1="4" x2="15" y2="4"/><circle cx="10" cy="4" r="1.6" fill="currentColor" stroke="none"/><line x1="1" y1="8" x2="15" y2="8"/><circle cx="5" cy="8" r="1.6" fill="currentColor" stroke="none"/><line x1="1" y1="12" x2="15" y2="12"/><circle cx="11.5" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>'
// Klassischer Mauszeiger-Pfeil (gefuellt statt nur Umriss, wie ein echter
// Cursor) fuer den "Klick im Viewer waehlt Block aus"-Umschalter (siehe
// viewer/blockPicker.ts) - eindeutig als "Auswaehlen/Zeigen" erkennbar,
// anders als ein generisches Fadenkreuz oder Rahmen-Symbol.
const CURSOR_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true"><path d="M2 1L2 13.5L5.2 10.6L7.3 14.8L9.3 13.8L7.2 9.6L11.5 9.2Z"/></svg>'
// Zwei versetzte Balken plus eine gestrichelte Ausrichtungslinie dazwischen -
// fuer den "Ausrichten"-Knopf (siehe Ausrichten-Popover unten): eindeutig als
// "zwei Objekte an einer Linie ausrichten" erkennbar, anders als generische
// Pfeil-/Gitter-Icons.
const ALIGN_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><line x1="8" y1="1" x2="8" y2="15" stroke-dasharray="2 2"/><rect x="2" y="3" width="4" height="3.5"/><rect x="10" y="9.5" width="4" height="3.5"/></svg>'
// Schlichtes Dreieck (kein Unicode "▶", siehe Tofu-Begruendung oben) fuer
// den "Explosionsansicht abspielen"-Knopf - animiert den Explosionsfaktor
// von 0 auf den aktuellen Reglerwert statt ihn nur manuell zu ziehen.
const PLAY_ICON_SVG =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true"><path d="M4 2.5L13 8L4 13.5Z"/></svg>'
// Thermometer (Roehre + Kolben) fuer die Wandstaerken-Heatmap - assoziiert
// direkt mit einer "heiss/kalt"-Farbskala, anders als ein generisches
// Farbeimer- oder Verlaufs-Icon.
const HEATMAP_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M9 9.5V3.5a1.5 1.5 0 0 0-3 0v6a2.5 2.5 0 1 0 3 0Z" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none"/></svg>'
// Schachbrettmuster (vier Kacheln, diagonal invertiert) - branchenuebliches
// Symbol fuer Transparenz/Alpha-Kanal (z.B. Photoshop/Illustrator), eindeutig
// von den anderen Umschaltern hier unterscheidbar.
const TRANSPARENCY_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="1" y="1" width="7" height="7" fill="currentColor"/><rect x="8" y="8" width="7" height="7" fill="currentColor"/></svg>'
// Taschenlampe (Griff + ausgestellter Lampenkopf) mit drei austretenden
// Lichtstrahlen - fuer den "Licht folgt dem Mauszeiger"-Umschalter.
const FLASHLIGHT_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h5l2-2v8l-2-2H2z"/><line x1="12" y1="3" x2="14.5" y2="1.5"/><line x1="12.5" y1="8" x2="15" y2="8"/><line x1="12" y1="13" x2="14.5" y2="14.5"/></svg>'

function encodeColorFilterValue(color: string | null): string {
  return color === null ? DEFAULT_COLOR_OPTION_VALUE : color
}

/** Cache-/Zuordnungs-Schluessel fuer ein Fragment - Farbe ALLEIN reicht seit
 *  der blockId-Aufteilung in codegen/colorFragments.ts nicht mehr aus:
 *  mehrere Top-Level-Bloecke koennen dieselbe Farbe teilen (der haeufigste
 *  Fall: unfarbige/Standardfarbe-Objekte), wuerden sich sonst im Cache
 *  gegenseitig ueberschreiben bzw. beim Zuordnen von Render-Ergebnissen
 *  verwechselt werden. */
function fragmentCacheKey(fragment: { color: string | null; blockId?: string }): string {
  return `${encodeColorFilterValue(fragment.color)}|${fragment.blockId ?? ''}`
}

function decodeColorFilterValues(values: string[]): ColorFilter {
  return values.map((value) => (value === DEFAULT_COLOR_OPTION_VALUE ? null : value))
}

const DEBOUNCE_MS = 400

type Quality = 'low' | 'medium' | 'high'
const QUALITY_FN: Record<Quality, number | null> = { low: 8, medium: null, high: 64 }

const VIEW_PRESETS: {
  value: ViewPreset
  labelKey:
    | 'viewer.view_front'
    | 'viewer.view_back'
    | 'viewer.view_left'
    | 'viewer.view_right'
    | 'viewer.view_top'
    | 'viewer.view_bottom'
    | 'viewer.view_iso'
}[] = [
  { value: 'front', labelKey: 'viewer.view_front' },
  { value: 'back', labelKey: 'viewer.view_back' },
  { value: 'left', labelKey: 'viewer.view_left' },
  { value: 'right', labelKey: 'viewer.view_right' },
  { value: 'top', labelKey: 'viewer.view_top' },
  { value: 'bottom', labelKey: 'viewer.view_bottom' },
  { value: 'iso', labelKey: 'viewer.view_iso' },
]

/**
 * Verdrahtet die komplette Kette Codegen -> Render-Worker -> 3D-Viewer und
 * baut die dazugehoerige Werkzeugleisten in `root` auf: eine erste Zeile mit
 * Kamera/Achsen/Farbe, eine zweite mit vier eigenstaendigen Icon-Popovern
 * (Farben/Export, Glaette, Schnittebene, Ausleuchtung), Status mittig,
 * Auto/Rendern unten.
 */
export function mountViewerPanel(
  root: HTMLElement,
  workspace: WorkspaceSvg,
  viewerPopout?: PopoutHandle,
): void {
  root.innerHTML = `
    <div class="viewer-controls">
      <button type="button" class="btn btn-icon" id="toggle-axes-btn" aria-pressed="true" title="${t('viewer.toggle_axes')}">✛</button>
      <button type="button" class="btn btn-icon" id="zoom-in-btn" title="${t('viewer.zoom_in')}">+</button>
      <button type="button" class="btn btn-icon" id="zoom-out-btn" title="${t('viewer.zoom_out')}">−</button>
      <button type="button" class="btn btn-icon" id="reset-view-btn" title="${t('viewer.reset_view')}">⌂</button>
      <select class="menu-select" id="view-preset-select" title="${t('viewer.view_preset')}">
        ${VIEW_PRESETS.map((p) => `<option value="${p.value}"${p.value === 'iso' ? ' selected' : ''}>${t(p.labelKey)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-icon" id="reset-scene-btn" title="${t('viewer.reset_scene')}">↺</button>
      <button type="button" class="btn btn-icon" id="reload-viewer-btn" title="${t('viewer.reload_viewer')}">⟳</button>
      <div class="menu-wrapper" id="record-menu-wrapper">
        <button type="button" class="btn btn-icon" id="record-menu-btn" aria-haspopup="true" aria-expanded="false" aria-pressed="false" title="${t('viewer.record_start')}">${CAMERA_ICON_SVG}</button>
        <div class="menu-dropdown record-menu-dropdown" id="record-menu-dropdown" hidden>
          <button type="button" class="btn btn-icon" id="record-btn" aria-pressed="false" title="${t('viewer.record_start')}">${CAMERA_ICON_SVG}</button>
          <button type="button" class="btn btn-icon" id="record-pause-btn" aria-pressed="false" title="${t('viewer.record_pause')}" hidden>⏸</button>
          <button type="button" class="btn btn-icon" id="record-mic-btn" aria-pressed="false" title="${t('viewer.record_mic')}">${MIC_ICON_SVG}</button>
        </div>
      </div>
      <button type="button" class="btn btn-icon viewer-popout-btn" id="popout-viewer-btn" aria-pressed="false" title="${t('popout_viewer.open')}" aria-label="${t('popout_viewer.open')}">${POPOUT_ICON_SVG}</button>
    </div>
    <div class="viewer-controls viewer-controls-secondary">
      <div class="menu-wrapper" id="colors-menu-wrapper">
        <button type="button" class="btn btn-icon" id="colors-menu-btn" aria-haspopup="true" aria-expanded="false" title="${t('viewer.export_color')}">▦</button>
        <div class="menu-dropdown" id="colors-menu-dropdown" hidden>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.export_color')}</span>
            <label class="menu-mesh-color-row" for="mesh-color-input">
              ${t('viewer.mesh_color')}
              <input type="color" class="color-swatch" id="mesh-color-input" value="#00ffff" />
            </label>
            <div class="export-color-options" id="export-color-options"></div>
            <button type="button" class="menu-item" id="export-stl-item" disabled>${t('viewer.export_stl')}</button>
            <button type="button" class="menu-item" id="embed-stl-item" disabled>${t('viewer.embed_stl')}</button>
            <button type="button" class="menu-item" id="export-glb-item" disabled>${t('viewer.export_glb')}</button>
            <button type="button" class="menu-item" id="export-screenshot-item">${t('viewer.screenshot')}</button>
            <button type="button" class="menu-item" id="export-full-image-item">${t('viewer.export_full_image')}</button>
          </div>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.quality')}</span>
            <label><input type="radio" name="quality" value="low" /> ${t('viewer.quality_low')}</label>
            <label><input type="radio" name="quality" value="medium" checked /> ${t('viewer.quality_medium')}</label>
            <label><input type="radio" name="quality" value="high" /> ${t('viewer.quality_high')}</label>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-icon" id="toggle-wireframe-btn" aria-pressed="false" title="${t('viewer.toggle_wireframe')}">△</button>
      <button type="button" class="btn btn-icon" id="toggle-heatmap-btn" aria-pressed="false" title="${t('viewer.toggle_heatmap')}">${HEATMAP_ICON_SVG}</button>
      <button type="button" class="btn btn-icon" id="toggle-flashlight-btn" aria-pressed="false" title="${t('viewer.toggle_flashlight')}">${FLASHLIGHT_ICON_SVG}</button>
      <div class="menu-wrapper" id="clipping-menu-wrapper">
        <button type="button" class="btn btn-icon" id="clipping-menu-btn" aria-haspopup="true" aria-expanded="false" aria-pressed="false" title="${t('viewer.clipping')}">✂</button>
        <div class="menu-dropdown" id="clipping-menu-dropdown" hidden>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.clipping')}</span>
            <label><input type="checkbox" id="clipping-enabled-checkbox" /> ${t('viewer.clipping_enabled')}</label>
            <div class="segmented-buttons">
              <button type="button" class="btn btn-small" id="clipping-axis-x-btn" aria-pressed="false">X</button>
              <button type="button" class="btn btn-small" id="clipping-axis-y-btn" aria-pressed="false">Y</button>
              <button type="button" class="btn btn-small" id="clipping-axis-z-btn" aria-pressed="true">Z</button>
            </div>
            <label><input type="checkbox" id="clipping-invert-checkbox" /> ${t('viewer.clipping_invert')}</label>
            <div class="slider-row">
              <input
                type="range"
                id="clipping-position-input"
                min="-150"
                max="150"
                value="0"
                step="0.01"
              />
              <input
                type="number"
                id="clipping-position-number"
                class="clipping-position-number"
                min="-150"
                max="150"
                value="0.00"
                step="0.01"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="menu-wrapper" id="explosion-menu-wrapper">
        <button type="button" class="btn btn-icon" id="explosion-menu-btn" aria-haspopup="true" aria-expanded="false" aria-pressed="false" title="${t('viewer.explosion')}">${EXPLOSION_ICON_SVG}</button>
        <div class="menu-dropdown" id="explosion-menu-dropdown" hidden>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.explosion')}</span>
            <label><input type="checkbox" id="explosion-enabled-checkbox" /> ${t('viewer.clipping_enabled')}</label>
            <div class="slider-row">
              <input type="range" id="explosion-input" min="0" max="100" value="0" step="1" aria-label="${t('viewer.explosion_amount')}" />
              <button type="button" class="btn btn-icon btn-small" id="explosion-play-btn" title="${t('viewer.explosion_play')}" aria-label="${t('viewer.explosion_play')}">${PLAY_ICON_SVG}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="menu-wrapper" id="transparency-menu-wrapper">
        <button type="button" class="btn btn-icon" id="transparency-menu-btn" aria-haspopup="true" aria-expanded="false" aria-pressed="false" title="${t('viewer.transparency')}">${TRANSPARENCY_ICON_SVG}</button>
        <div class="menu-dropdown" id="transparency-menu-dropdown" hidden>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.transparency')}</span>
            <div class="slider-row">
              <input type="range" id="transparency-input" min="10" max="80" value="50" step="1" aria-label="${t('viewer.transparency_amount')}" />
            </div>
            <span class="menu-hint" id="transparency-status">${t('viewer.transparency_pick_hint')}</span>
            <button type="button" class="btn btn-small" id="transparency-reset-btn">${t('viewer.transparency_reset')}</button>
          </div>
        </div>
      </div>
      <div class="menu-wrapper" id="align-menu-wrapper">
        <button type="button" class="btn btn-icon" id="align-menu-btn" aria-haspopup="true" aria-expanded="false" title="${t('viewer.align')}">${ALIGN_ICON_SVG}</button>
        <div class="menu-dropdown" id="align-menu-dropdown" hidden>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.align')}</span>
            <span class="menu-label">${t('viewer.align_axis')}</span>
            <div class="segmented-buttons">
              <button type="button" class="btn btn-small" id="align-axis-x-btn" aria-pressed="true">X</button>
              <button type="button" class="btn btn-small" id="align-axis-y-btn" aria-pressed="false">Y</button>
              <button type="button" class="btn btn-small" id="align-axis-z-btn" aria-pressed="false">Z</button>
            </div>
            <div class="segmented-buttons">
              <button type="button" class="btn btn-small" id="align-min-btn" aria-pressed="true">${t('viewer.align_min')}</button>
              <button type="button" class="btn btn-small" id="align-mid-btn" aria-pressed="false">${t('viewer.align_mid')}</button>
              <button type="button" class="btn btn-small" id="align-max-btn" aria-pressed="false">${t('viewer.align_max')}</button>
            </div>
            <span class="menu-hint" id="align-status">${t('viewer.align_pick_anchor')}</span>
            <button type="button" class="btn btn-small" id="align-reset-btn">${t('viewer.align_reset')}</button>
          </div>
        </div>
      </div>
      <button type="button" class="btn btn-icon" id="check-collisions-btn" aria-pressed="false" title="${t('viewer.check_collisions')}">⚠</button>
      <button type="button" class="btn btn-icon" id="toggle-measure-btn" aria-pressed="false" title="${t('viewer.toggle_measure')}">↔</button>
      <button type="button" class="btn btn-icon" id="toggle-measure-angle-btn" aria-pressed="false" title="${t('viewer.toggle_measure_angle')}">∠</button>
      <button type="button" class="btn btn-icon" id="toggle-block-select-btn" aria-pressed="false" title="${t('viewer.toggle_block_select')}">${CURSOR_ICON_SVG}</button>
      <button type="button" class="btn btn-icon" id="toggle-customizer-overlay-btn" aria-pressed="false" title="${t('customizer.toggle_overlay')}">${CUSTOMIZER_ICON_SVG}</button>
      <button type="button" class="btn btn-icon" id="toggle-shadows-btn" aria-pressed="false" title="${t('viewer.toggle_shadows')}">◐</button>
      <div class="menu-wrapper" id="light-menu-wrapper">
        <button type="button" class="btn btn-icon" id="light-menu-btn" aria-haspopup="true" aria-expanded="false" title="${t('viewer.light')}">☀</button>
        <div class="menu-dropdown" id="light-menu-dropdown" hidden>
          <div class="menu-section">
            <span class="menu-label">${t('viewer.light')}</span>
            <label class="menu-label" for="light-intensity-input">${t('viewer.light_intensity')}</label>
            <input type="range" id="light-intensity-input" min="0" max="2" value="0.9" step="0.05" />
            <label class="menu-label" for="light-angle-input">${t('viewer.light_angle')}</label>
            <input type="range" id="light-angle-input" min="0" max="360" value="243" step="1" />
            <label><input type="checkbox" id="light-auto-rotate-checkbox" /> ${t('viewer.light_auto_rotate')}</label>
            <label class="menu-label" for="light-speed-input">${t('viewer.light_speed')}</label>
            <input type="range" id="light-speed-input" min="1" max="120" value="20" step="1" />
            <label><input type="checkbox" id="studio-mode-checkbox" /> ${t('viewer.studio_mode')}</label>
          </div>
        </div>
      </div>
    </div>
    <div class="viewer-canvas" id="viewer-canvas">
      <span class="render-status" id="render-status"></span>
      <span class="measure-status" id="measure-status" hidden></span>
      <div class="customizer-overlay" id="customizer-overlay" hidden>
        <div class="customizer-overlay-header">
          <span class="customizer-overlay-title">${t('customizer.title')}</span>
          <button type="button" class="btn btn-icon customizer-overlay-close" id="customizer-overlay-close-btn" title="${t('info.close')}">✕</button>
        </div>
        <div class="customizer-body"></div>
      </div>
    </div>
    <div class="viewer-bottom">
      <button type="button" class="btn btn-small" id="render-now-btn" disabled>${t('viewer.render_now')}</button>
      <label class="auto-render-toggle">
        <input type="checkbox" id="auto-render-checkbox" checked />
        ${t('viewer.auto')}
      </label>
    </div>
  `

  const status = root.querySelector<HTMLSpanElement>('#render-status')!
  const autoCheckbox = root.querySelector<HTMLInputElement>('#auto-render-checkbox')!
  const renderNowBtn = root.querySelector<HTMLButtonElement>('#render-now-btn')!
  const exportStlItem = root.querySelector<HTMLButtonElement>('#export-stl-item')!
  const embedStlItem = root.querySelector<HTMLButtonElement>('#embed-stl-item')!
  const exportGlbItem = root.querySelector<HTMLButtonElement>('#export-glb-item')!
  const exportColorOptions = root.querySelector<HTMLDivElement>('#export-color-options')!
  const exportScreenshotItem = root.querySelector<HTMLButtonElement>('#export-screenshot-item')!
  const exportFullImageItem = root.querySelector<HTMLButtonElement>('#export-full-image-item')!
  const canvasContainer = root.querySelector<HTMLElement>('#viewer-canvas')!
  const colorInput = root.querySelector<HTMLInputElement>('#mesh-color-input')!
  const axesBtn = root.querySelector<HTMLButtonElement>('#toggle-axes-btn')!
  const shadowsBtn = root.querySelector<HTMLButtonElement>('#toggle-shadows-btn')!
  const wireframeBtn = root.querySelector<HTMLButtonElement>('#toggle-wireframe-btn')!
  const heatmapBtn = root.querySelector<HTMLButtonElement>('#toggle-heatmap-btn')!
  const flashlightBtn = root.querySelector<HTMLButtonElement>('#toggle-flashlight-btn')!
  const measureBtn = root.querySelector<HTMLButtonElement>('#toggle-measure-btn')!
  const measureAngleBtn = root.querySelector<HTMLButtonElement>('#toggle-measure-angle-btn')!
  const measureStatus = root.querySelector<HTMLSpanElement>('#measure-status')!
  const blockSelectBtn = root.querySelector<HTMLButtonElement>('#toggle-block-select-btn')!
  const alignDropdown = root.querySelector<HTMLDivElement>('#align-menu-dropdown')!
  const alignAxisXBtn = root.querySelector<HTMLButtonElement>('#align-axis-x-btn')!
  const alignAxisYBtn = root.querySelector<HTMLButtonElement>('#align-axis-y-btn')!
  const alignAxisZBtn = root.querySelector<HTMLButtonElement>('#align-axis-z-btn')!
  const alignMinBtn = root.querySelector<HTMLButtonElement>('#align-min-btn')!
  const alignMidBtn = root.querySelector<HTMLButtonElement>('#align-mid-btn')!
  const alignMaxBtn = root.querySelector<HTMLButtonElement>('#align-max-btn')!
  const alignResetBtn = root.querySelector<HTMLButtonElement>('#align-reset-btn')!
  const alignStatus = root.querySelector<HTMLSpanElement>('#align-status')!
  const checkCollisionsBtn = root.querySelector<HTMLButtonElement>('#check-collisions-btn')!
  const customizerOverlayBtn = root.querySelector<HTMLButtonElement>(
    '#toggle-customizer-overlay-btn',
  )!
  const customizerOverlay = root.querySelector<HTMLDivElement>('#customizer-overlay')!
  const customizerOverlayCloseBtn = root.querySelector<HTMLButtonElement>(
    '#customizer-overlay-close-btn',
  )!
  const customizerOverlayBody = customizerOverlay.querySelector<HTMLDivElement>('.customizer-body')!
  const zoomInBtn = root.querySelector<HTMLButtonElement>('#zoom-in-btn')!
  const zoomOutBtn = root.querySelector<HTMLButtonElement>('#zoom-out-btn')!
  const resetViewBtn = root.querySelector<HTMLButtonElement>('#reset-view-btn')!
  const viewPresetSelect = root.querySelector<HTMLSelectElement>('#view-preset-select')!
  const resetSceneBtn = root.querySelector<HTMLButtonElement>('#reset-scene-btn')!
  const reloadViewerBtn = root.querySelector<HTMLButtonElement>('#reload-viewer-btn')!
  const recordMenuBtn = root.querySelector<HTMLButtonElement>('#record-menu-btn')!
  const recordBtn = root.querySelector<HTMLButtonElement>('#record-btn')!
  const recordPauseBtn = root.querySelector<HTMLButtonElement>('#record-pause-btn')!
  const recordMicBtn = root.querySelector<HTMLButtonElement>('#record-mic-btn')!
  const qualityRadios = root.querySelectorAll<HTMLInputElement>('input[name="quality"]')
  const clippingMenuBtn = root.querySelector<HTMLButtonElement>('#clipping-menu-btn')!
  const clippingEnabledCheckbox = root.querySelector<HTMLInputElement>(
    '#clipping-enabled-checkbox',
  )!
  const clippingAxisXBtn = root.querySelector<HTMLButtonElement>('#clipping-axis-x-btn')!
  const clippingAxisYBtn = root.querySelector<HTMLButtonElement>('#clipping-axis-y-btn')!
  const clippingAxisZBtn = root.querySelector<HTMLButtonElement>('#clipping-axis-z-btn')!
  const clippingInvertCheckbox = root.querySelector<HTMLInputElement>('#clipping-invert-checkbox')!
  const clippingPositionInput = root.querySelector<HTMLInputElement>('#clipping-position-input')!
  const clippingPositionNumber = root.querySelector<HTMLInputElement>('#clipping-position-number')!
  const lightIntensityInput = root.querySelector<HTMLInputElement>('#light-intensity-input')!
  const lightAngleInput = root.querySelector<HTMLInputElement>('#light-angle-input')!
  const lightAutoRotateCheckbox = root.querySelector<HTMLInputElement>(
    '#light-auto-rotate-checkbox',
  )!
  const lightSpeedInput = root.querySelector<HTMLInputElement>('#light-speed-input')!
  const studioModeCheckbox = root.querySelector<HTMLInputElement>('#studio-mode-checkbox')!
  const explosionInput = root.querySelector<HTMLInputElement>('#explosion-input')!
  const explosionMenuBtn = root.querySelector<HTMLButtonElement>('#explosion-menu-btn')!
  const explosionPlayBtn = root.querySelector<HTMLButtonElement>('#explosion-play-btn')!
  const explosionEnabledCheckbox = root.querySelector<HTMLInputElement>(
    '#explosion-enabled-checkbox',
  )!
  const transparencyInput = root.querySelector<HTMLInputElement>('#transparency-input')!
  const transparencyMenuBtn = root.querySelector<HTMLButtonElement>('#transparency-menu-btn')!
  const transparencyDropdown = root.querySelector<HTMLDivElement>('#transparency-menu-dropdown')!
  const transparencyStatus = root.querySelector<HTMLSpanElement>('#transparency-status')!
  const transparencyResetBtn = root.querySelector<HTMLButtonElement>('#transparency-reset-btn')!

  // Ein Text pro (Modus, bereits gesetzte Punktzahl)-Kombination waehrend
  // eine Messung laeuft - Distanz braucht 2, Winkel 3 Punkte (siehe
  // measure.ts::POINTS_NEEDED).
  const WAITING_PROMPTS: Record<'distance' | 'angle', readonly string[]> = {
    distance: ['viewer.measure_first_point', 'viewer.measure_second_point'],
    angle: [
      'viewer.measure_vertex_point',
      'viewer.measure_first_leg_point',
      'viewer.measure_second_leg_point',
    ],
  }

  function applyMeasureStatus(result: MeasureStatus): void {
    if (result.state === 'waiting') {
      const key = WAITING_PROMPTS[result.mode][result.pointsSet] as Parameters<typeof t>[0]
      measureStatus.textContent = t(key)
    } else if (result.mode === 'distance') {
      measureStatus.textContent = `${t('viewer.measure_distance')} ${result.distance.toFixed(2)}`
    } else {
      measureStatus.textContent = `${t('viewer.measure_angle')} ${result.angleDegrees.toFixed(1)}°`
    }
  }

  /** Klick auf ein Teil im Viewer (siehe viewer/blockPicker.ts) springt zum
   *  Blockly-Block, der es erzeugt hat - `workspace.getBlockById` liefert
   *  `null`, wenn der Block inzwischen geloescht wurde (Mesh eines
   *  vorherigen Render-Stands, noch nicht neu gerendert), dann einfach
   *  nichts tun statt abzustuerzen. Vorherige Auswahl(en) explizit aufheben:
   *  `block.select()` macht die Auswahl in dieser Blockly-Version NICHT von
   *  sich aus exklusiv (ein zuvor ausgewaehlter Block bliebe sonst
   *  zusaetzlich markiert stehen, verifiziert per Test) - ohne dieses
   *  manuelle Aufraeumen wuerden nach mehreren Klicks im Viewer immer mehr
   *  Bloecke gleichzeitig markiert bleiben. */
  function jumpToBlock(blockId: string): void {
    const block = workspace.getBlockById(blockId)
    if (!block) return
    for (const other of workspace.getAllBlocks(false)) {
      if (other.id !== blockId) other.unselect()
    }
    workspace.centerOnBlock(blockId)
    block.select()
    // Kurzes Aufblitzen (siehe .bsn-block-jump-flash in layout.css) lenkt
    // den Blick gezielt auf den Block, vor allem nachdem centerOnBlock()
    // gerade erst dorthin gescrollt hat - Blocklys dauerhafter gelber
    // Auswahlrahmen allein faellt dabei kaum auf. Klasse zuerst entfernen +
    // Reflow erzwingen, damit ein erneuter Klick auf DENSELBEN Block die
    // Animation neu startet statt sie (weil die Klasse schon dran haengt)
    // stillschweigend zu ignorieren. Nach Ablauf der Animation die Klasse
    // wieder entfernen (statt dauerhaft angeheftet zu lassen): Blockly
    // verschiebt das SVG-Root eines ausgewaehlten Blocks per bringToFront()
    // an das Ende seines Elternknotens - dieses erneute appendChild() eines
    // bereits im DOM haengenden Elements startet CSS-Animationen mit fester
    // Wiederholungszahl neu. Ohne dieses Aufraeumen wuerde daher jede
    // spaetere Auswahl DESSELBEN Blocks (auch eine ganz normale Auswahl im
    // Design, voellig unabhaengig vom "Zeiger"-Umschalter oben) das
    // Aufblitzen erneut auszuloesen scheinen.
    const svgRoot = block.getSvgRoot()
    svgRoot.classList.remove('bsn-block-jump-flash')
    void svgRoot.getBoundingClientRect()
    svgRoot.classList.add('bsn-block-jump-flash')
    svgRoot.addEventListener(
      'animationend',
      () => svgRoot.classList.remove('bsn-block-jump-flash'),
      { once: true },
    )
  }

  // Ausrichten: das ERSTE Objekt, das nach Oeffnen des Popovers im Viewer
  // angeklickt wird, ist der Anker; jedes WEITERE angeklickte Objekt wird
  // sofort relativ zu diesem Anker verschoben (Anker bleibt bestehen, bis er
  // per erneutem Klick auf ihn selbst oder ueber den "Zuruecksetzen"-Knopf
  // geloescht wird) - Nutzerentscheidung "auf erstes angeklickt".
  let alignAnchorId: string | null = null

  function getSelectedAlignMode(): 'min' | 'mid' | 'max' {
    if (alignMidBtn.getAttribute('aria-pressed') === 'true') return 'mid'
    if (alignMaxBtn.getAttribute('aria-pressed') === 'true') return 'max'
    return 'min'
  }

  function getSelectedAlignAxis(): ClipAxis {
    if (alignAxisYBtn.getAttribute('aria-pressed') === 'true') return 'y'
    if (alignAxisZBtn.getAttribute('aria-pressed') === 'true') return 'z'
    return 'x'
  }

  function updateAlignStatus(): void {
    alignStatus.textContent = alignAnchorId
      ? t('viewer.align_pick_target')
      : t('viewer.align_pick_anchor')
  }

  function handleAlignPick(blockId: string): void {
    if (blockId === alignAnchorId) {
      alignAnchorId = null
      updateAlignStatus()
      return
    }
    if (!alignAnchorId) {
      alignAnchorId = blockId
      updateAlignStatus()
      return
    }
    const axis = getSelectedAlignAxis()
    const mode = getSelectedAlignMode()
    const anchorRange = viewer.getAxisRange(alignAnchorId, axis)
    const targetRange = viewer.getAxisRange(blockId, axis)
    // z.B. Render noch nicht abgeschlossen oder Block ohne Geometrie - still
    // ueberspringen statt eine verwirrende Fehlermeldung zu zeigen.
    if (!anchorRange || !targetRange) return
    alignBlockByDelta(workspace, blockId, axis, anchorRange[mode] - targetRange[mode])
    void triggerRender()
  }

  // Ersetzt den vormals direkt durchgereichten jumpToBlock-Callback: bei
  // geoeffnetem Ausrichten-Popover werden Klicks im Viewer stattdessen fuer
  // die Anker-/Ziel-Auswahl verwendet, statt zum Block zu springen.
  function handleBlockPick(blockId: string): void {
    if (!alignDropdown.hidden) {
      handleAlignPick(blockId)
      return
    }
    if (!transparencyDropdown.hidden) {
      handleTransparencyPick(blockId)
      return
    }
    jumpToBlock(blockId)
  }

  const viewer = createViewer(canvasContainer, applyMeasureStatus, handleBlockPick)
  // `let` statt `const`: der "3D-Ansicht neu laden"-Knopf (reloadViewerBtn
  // unten) muss bei einem haengengebliebenen Render-Worker (z.B. eine
  // OpenSCAD-Berechnung, die nie zurueckkehrt) einen KOMPLETT NEUEN Worker
  // erzeugen koennen - der alte wird dabei per client.dispose() (terminate())
  // hart abgebrochen, ein blosses erneutes Rendern ueber denselben (haengenden)
  // Worker wuerde nie ankommen.
  let client = createRenderClient()

  colorInput.value = viewer.getMeshColor()
  colorInput.addEventListener('input', () => {
    viewer.setMeshColor(colorInput.value)
    // Das Mini-Faerbchen neben "Standardfarbe" in der Export-/Sichtbarkeits-
    // Liste zeigt denselben Farbwert, wird aber nur beim Neuaufbau der Liste
    // (populateExportColorSelect(), nach einem Render) neu gesetzt — ohne
    // diesen direkten Abgleich bliebe es bis zum naechsten Render veraltet.
    const defaultSwatch = exportColorOptions.querySelector<HTMLElement>(
      `input[value="${DEFAULT_COLOR_OPTION_VALUE}"] ~ .color-swatch-mini`,
    )
    if (defaultSwatch) defaultSwatch.style.backgroundColor = colorInput.value
  })

  let axesVisible = true
  axesBtn.addEventListener('click', () => {
    axesVisible = !axesVisible
    viewer.setAxesVisible(axesVisible)
    axesBtn.setAttribute('aria-pressed', String(axesVisible))
  })

  let shadowsEnabled = false
  function applyShadows(enabled: boolean): void {
    shadowsEnabled = enabled
    viewer.setShadowsEnabled(enabled)
    shadowsBtn.setAttribute('aria-pressed', String(enabled))
  }
  applyShadows(shadowsEnabled)
  shadowsBtn.addEventListener('click', () => applyShadows(!shadowsEnabled))

  let wireframeEnabled = false
  wireframeBtn.addEventListener('click', () => {
    wireframeEnabled = !wireframeEnabled
    viewer.setWireframe(wireframeEnabled)
    wireframeBtn.setAttribute('aria-pressed', String(wireframeEnabled))
  })

  let heatmapEnabled = false
  heatmapBtn.addEventListener('click', () => {
    heatmapEnabled = !heatmapEnabled
    viewer.setWallThicknessHeatmap(heatmapEnabled)
    heatmapBtn.setAttribute('aria-pressed', String(heatmapEnabled))
  })

  flashlightBtn.addEventListener('click', () => {
    const enabled = !viewer.isFlashlightEnabled()
    viewer.setFlashlightEnabled(enabled)
    flashlightBtn.setAttribute('aria-pressed', String(enabled))
  })

  // measure.ts::MeasureTool.setActive() ruft intern immer reset() auf, was
  // ueber den bei createViewer() verdrahteten onMeasureChange-Callback
  // (applyMeasureStatus) automatisch den korrekten "waiting"-Text setzt -
  // hier muss dafuer nichts manuell nachgezogen werden.
  function setMeasureModeEnabled(enabled: boolean, mode: MeasureMode = 'distance'): void {
    viewer.setMeasureMode(enabled, mode)
    measureBtn.setAttribute('aria-pressed', String(enabled && mode === 'distance'))
    measureAngleBtn.setAttribute('aria-pressed', String(enabled && mode === 'angle'))
    measureStatus.hidden = !enabled
  }
  measureBtn.addEventListener('click', () => {
    const isActive = viewer.isMeasureModeActive() && viewer.getMeasureMode() === 'distance'
    setMeasureModeEnabled(!isActive, 'distance')
  })
  measureAngleBtn.addEventListener('click', () => {
    const isActive = viewer.isMeasureModeActive() && viewer.getMeasureMode() === 'angle'
    setMeasureModeEnabled(!isActive, 'angle')
  })
  // Standardmaessig AUS (aria-pressed="false" schon im Markup) - der Nutzer
  // kann "Klick im Viewer springt zum Block" hier bewusst einschalten, statt
  // beim blossen Betrachten des Modells ungewollt zwischen Bloecken hin- und
  // herzuspringen.
  blockSelectBtn.addEventListener('click', () => {
    const enabled = blockSelectBtn.getAttribute('aria-pressed') !== 'true'
    viewer.setBlockPickEnabled(enabled)
    blockSelectBtn.setAttribute('aria-pressed', String(enabled))
  })
  // "Aktiv" heisst hier: die Kollisionsueberwachung ist eingeschaltet (Rand
  // um das Icon) - unabhaengig davon, ob gerade tatsaechlich Ueberschneidungen
  // angezeigt werden. Einmal eingeschaltet bleibt sie ueber Design-
  // Aenderungen hinweg an: jeder normale Render (siehe runRender()) wertet
  // sie automatisch neu aus, statt sie einfach abzuschalten - ein erneuter
  // Klick auf den Button ist die einzige Moeglichkeit, sie wieder
  // auszuschalten. "Szene zuruecksetzen" und ein komplett geleerter
  // Workspace schalten sie weiterhin explizit ab, da es dann nichts mehr zu
  // ueberwachen gibt.
  let collisionsActive = false
  function setCollisionsActive(active: boolean): void {
    collisionsActive = active
    checkCollisionsBtn.setAttribute('aria-pressed', String(active))
  }
  checkCollisionsBtn.addEventListener('click', () => {
    if (collisionsActive) {
      viewer.clearCollisions()
      setCollisionsActive(false)
      setStatus('success', '')
    } else {
      setCollisionsActive(true)
      void checkCollisions()
    }
  })

  // Customizer als Overlay direkt im Viewer (siehe customizerBody.ts).
  // Einmalig verdrahten, bei jedem Einblenden wird der Inhalt frisch aus
  // dem aktuellen Workspace-Stand aufgebaut.
  wireCustomizerBody(customizerOverlayBody, workspace, () => {
    // Direkter, timerfreier Trigger (siehe Begruendung in customizerBody.ts)
    // - laesst den ueblichen Debounce-Pfad ueber workspace.addChangeListener
    // unten unangetastet (der feuert durch die von setFieldValue() ausgeloeste
    // Blockly-Aenderung ohnehin zusaetzlich, harmlos redundant dank
    // renderInFlight/rerenderPending-Absicherung in triggerRender()).
    if (resetPreviewIfWorkspaceEmpty()) return
    if (!autoCheckbox.checked) {
      setStatus('stale', t('viewer.stale'))
      return
    }
    void triggerRender()
  })

  function setCustomizerOverlayVisible(visible: boolean): void {
    customizerOverlay.hidden = !visible
    customizerOverlayBtn.setAttribute('aria-pressed', String(visible))
    if (visible) customizerOverlayBody.innerHTML = buildCustomizerBodyHtml(workspace)
  }
  customizerOverlayBtn.addEventListener('click', () => {
    setCustomizerOverlayVisible(Boolean(customizerOverlay.hidden))
  })
  customizerOverlayCloseBtn.addEventListener('click', () => setCustomizerOverlayVisible(false))
  // Schneller Ausstieg per Escape, ohne extra zum Button greifen zu muessen -
  // greift nur, wenn der Modus tatsaechlich aktiv ist, um andere Escape-
  // Handler (z.B. offene Dialoge) nicht ungewollt mitauszuloesen.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && viewer.isMeasureModeActive()) setMeasureModeEnabled(false)
  })

  // Der Schatten der Schnittebenen-Deckflaeche wuerde sonst nicht zur
  // sichtbar abgeschnittenen Form passen (Schattenwurf respektiert die
  // Schnittebene nicht) — deshalb waehrend aktiver Schnittebene abgeschaltet
  // und der Umschalter gesperrt; beim Deaktivieren kommt der vorherige
  // Zustand zurueck.
  let shadowsEnabledBeforeClipping: boolean | null = null

  function getSelectedClippingAxis(): ClipAxis {
    if (clippingAxisXBtn.getAttribute('aria-pressed') === 'true') return 'x'
    if (clippingAxisYBtn.getAttribute('aria-pressed') === 'true') return 'y'
    return 'z'
  }

  function setClippingAxis(axis: ClipAxis): void {
    clippingAxisXBtn.setAttribute('aria-pressed', String(axis === 'x'))
    clippingAxisYBtn.setAttribute('aria-pressed', String(axis === 'y'))
    clippingAxisZBtn.setAttribute('aria-pressed', String(axis === 'z'))
  }

  function applyClipping(): void {
    const enabled = clippingEnabledCheckbox.checked
    viewer.setClipping(
      enabled,
      getSelectedClippingAxis(),
      Number(clippingPositionInput.value),
      clippingInvertCheckbox.checked,
    )
    clippingMenuBtn.setAttribute('aria-pressed', String(enabled))
    if (enabled) {
      if (shadowsEnabledBeforeClipping === null) {
        shadowsEnabledBeforeClipping = shadowsEnabled
        applyShadows(false)
        shadowsBtn.disabled = true
      }
    } else if (shadowsEnabledBeforeClipping !== null) {
      applyShadows(shadowsEnabledBeforeClipping)
      shadowsBtn.disabled = false
      shadowsEnabledBeforeClipping = null
    }
  }
  clippingEnabledCheckbox.addEventListener('change', applyClipping)
  clippingAxisXBtn.addEventListener('click', () => {
    setClippingAxis('x')
    applyClipping()
  })
  clippingAxisYBtn.addEventListener('click', () => {
    setClippingAxis('y')
    applyClipping()
  })
  clippingAxisZBtn.addEventListener('click', () => {
    setClippingAxis('z')
    applyClipping()
  })
  clippingInvertCheckbox.addEventListener('change', applyClipping)
  clippingPositionInput.addEventListener('input', () => {
    clippingPositionNumber.value = Number(clippingPositionInput.value).toFixed(2)
    // Den Regler zu bewegen soll die Schnittebene direkt sichtbar machen,
    // statt dass man vorher extra die Checkbox anhaken muss.
    clippingEnabledCheckbox.checked = true
    applyClipping()
  })
  clippingPositionNumber.addEventListener('input', () => {
    const value = Number(clippingPositionNumber.value)
    if (!Number.isFinite(value)) return
    clippingPositionInput.value = String(value)
    clippingEnabledCheckbox.checked = true
    applyClipping()
  })

  viewer.setLightIntensity(Number(lightIntensityInput.value))
  lightIntensityInput.addEventListener('input', () =>
    viewer.setLightIntensity(Number(lightIntensityInput.value)),
  )
  lightAngleInput.addEventListener('input', () =>
    viewer.setLightAngle(Number(lightAngleInput.value)),
  )
  function applyLightAutoRotate(): void {
    const enabled = lightAutoRotateCheckbox.checked
    viewer.setLightAutoRotate(enabled, Number(lightSpeedInput.value))
    // Waehrend die Lampe automatisch kreist, wuerde der Winkel-Regler sonst
    // nicht mitwandern und stumm veralten — deshalb waehrenddessen gesperrt.
    lightAngleInput.disabled = enabled
    if (!enabled) {
      // Beim Abschalten auf den Ausgangswinkel zuruecksetzen, statt dort
      // stehen zu bleiben, wo die automatische Kreisbewegung gerade war.
      lightAngleInput.value = lightAngleInput.defaultValue
      viewer.setLightAngle(Number(lightAngleInput.value))
    }
  }
  lightAutoRotateCheckbox.addEventListener('change', applyLightAutoRotate)
  lightSpeedInput.addEventListener('input', applyLightAutoRotate)

  // Gleiches Schatten-Kopplungsmuster wie applyClipping(): Studio-Modus
  // erzwingt Schatten (ohne die sieht der Grauverlauf-Hintergrund nicht nach
  // "Fotostudio" aus), merkt sich aber den vorherigen Zustand, um ihn beim
  // Verlassen wiederherzustellen statt Schatten einfach dauerhaft anzulassen.
  let shadowsEnabledBeforeStudio: boolean | null = null
  function applyStudioMode(): void {
    const enabled = studioModeCheckbox.checked
    viewer.setStudioMode(enabled)
    if (enabled) {
      if (shadowsEnabledBeforeStudio === null) {
        shadowsEnabledBeforeStudio = shadowsEnabled
        applyShadows(true)
      }
    } else if (shadowsEnabledBeforeStudio !== null) {
      applyShadows(shadowsEnabledBeforeStudio)
      shadowsEnabledBeforeStudio = null
    }
  }
  studioModeCheckbox.addEventListener('change', applyStudioMode)

  // Konsistent zu applyClipping(): ein eigenes "Aktiv"-Kaestchen entscheidet,
  // ob die Explosion ueberhaupt wirkt - der Regler behaelt seinen Wert auch
  // bei ausgeschaltetem Kaestchen (erneutes Aktivieren nimmt den zuletzt
  // eingestellten Betrag wieder auf, statt bei 0 neu anzufangen).
  function applyExplosion(): void {
    const enabled = explosionEnabledCheckbox.checked
    viewer.setExplosion(enabled ? Number(explosionInput.value) / 100 : 0)
    explosionMenuBtn.setAttribute('aria-pressed', String(enabled))
  }
  explosionEnabledCheckbox.addEventListener('change', applyExplosion)
  explosionInput.addEventListener('input', () => {
    // Den Regler zu bewegen soll die Explosionsansicht direkt sichtbar
    // machen, statt dass man vorher extra die Checkbox anhaken muss (gleiche
    // Vorab-Aktivierung wie beim "Abspielen"-Knopf, siehe playExplosionAnimation()).
    explosionEnabledCheckbox.checked = true
    applyExplosion()
  })

  // Einzeln per Klick im Viewer ausgewaehlte Bloecke (siehe
  // handleTransparencyPick unten), die den Regler-Wert uebernehmen sollen -
  // anders als Schnittebene/Explosion KEIN An/Aus fuers ganze Modell, da
  // sonst nicht steuerbar waere, WELCHE Teile transparent werden.
  const transparentBlockIds = new Set<string>()

  function updateTransparencyStatus(): void {
    transparencyStatus.textContent =
      transparentBlockIds.size > 0
        ? t('viewer.transparency_pick_hint_active')
        : t('viewer.transparency_pick_hint')
    transparencyMenuBtn.setAttribute('aria-pressed', String(transparentBlockIds.size > 0))
  }

  // Regler ist "Transparenz in %" (10-80), Material-Deckkraft ist der
  // Kehrwert - gilt fuer ALLE aktuell ausgewaehlten Bloecke gemeinsam.
  function applyTransparency(): void {
    const transparencyPercent = Number(transparencyInput.value)
    viewer.setTransparencySelection(transparentBlockIds, 1 - transparencyPercent / 100)
    updateTransparencyStatus()
  }
  transparencyInput.addEventListener('input', applyTransparency)

  // Klick im Viewer bei geoeffnetem Transparenz-Popover (siehe
  // wirePopover('transparency', ...) unten) schaltet genau dieses Fragment
  // ein/aus, statt wie sonst zum erzeugenden Block zu springen (gleiches
  // Muster wie handleAlignPick).
  function handleTransparencyPick(blockId: string): void {
    if (transparentBlockIds.has(blockId)) transparentBlockIds.delete(blockId)
    else transparentBlockIds.add(blockId)
    applyTransparency()
  }

  transparencyResetBtn.addEventListener('click', () => {
    transparentBlockIds.clear()
    applyTransparency()
  })

  // Animiert den Explosionsfaktor hin (0 -> Reglerwert) UND wieder zurueck
  // (Reglerwert -> 0) - ein vollstaendiges "Auseinanderziehen/Zusammenbauen"
  // wie in Explosionszeichnungen ueblich, statt nur einmalig aufzuklappen.
  // Steht der Regler noch bei 0 (nie manuell gesetzt), wird auf den vollen
  // Betrag animiert statt auf sich selbst (0 -> 0 zeigt sonst gar nichts).
  const EXPLOSION_PLAY_DURATION_MS = 1800 // je Richtung (hin ODER zurueck)
  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }
  function easeInCubic(t: number): number {
    return t * t * t
  }
  function playExplosionAnimation(): void {
    if (explosionPlayBtn.disabled) return // laeuft schon
    explosionEnabledCheckbox.checked = true
    const target = Number(explosionInput.value) || 100
    explosionPlayBtn.disabled = true
    const start = performance.now()
    function step(now: number): void {
      const elapsed = now - start
      let value: number
      if (elapsed < EXPLOSION_PLAY_DURATION_MS) {
        // Hin: beschleunigt auseinander, bremst kurz vor dem Zielwert ab.
        value = target * easeOutCubic(elapsed / EXPLOSION_PLAY_DURATION_MS)
      } else {
        // Zurueck: startet langsam, zieht zum Schluss zuegig wieder zusammen.
        const tBack = Math.min(
          (elapsed - EXPLOSION_PLAY_DURATION_MS) / EXPLOSION_PLAY_DURATION_MS,
          1,
        )
        value = target * (1 - easeInCubic(tBack))
      }
      explosionInput.value = String(value)
      applyExplosion()
      if (elapsed < EXPLOSION_PLAY_DURATION_MS * 2) {
        requestAnimationFrame(step)
      } else {
        explosionInput.value = '0'
        applyExplosion()
        explosionPlayBtn.disabled = false
      }
    }
    requestAnimationFrame(step)
  }
  explosionPlayBtn.addEventListener('click', playExplosionAnimation)

  zoomInBtn.addEventListener('click', () => viewer.zoomIn())
  zoomOutBtn.addEventListener('click', () => viewer.zoomOut())
  resetViewBtn.addEventListener('click', () => viewer.resetView())
  viewPresetSelect.addEventListener('change', () =>
    viewer.setView(viewPresetSelect.value as ViewPreset),
  )

  const recordingDialog = mountRecordingDialog({
    title: t('recording_dialog.title'),
    saveLabel: t('recording_dialog.save'),
    discardLabel: t('recording_dialog.discard'),
  })
  recordBtn.addEventListener('click', () => {
    if (viewer.isRecording()) {
      void viewer.stopRecording().then((blob) => {
        if (blob) recordingDialog.open(blob, buildRecordingFilename())
      })
      recordBtn.setAttribute('aria-pressed', 'false')
      recordBtn.title = t('viewer.record_start')
      recordBtn.innerHTML = CAMERA_ICON_SVG
      recordBtn.classList.remove('recording-paused')
      recordPauseBtn.hidden = true
      recordMicBtn.disabled = false
      recordMenuBtn.setAttribute('aria-pressed', 'false')
      recordMenuBtn.classList.remove('recording-paused')
      recordMenuBtn.title = t('viewer.record_start')
      return
    }
    // Waehrend der Start-Anfrage deaktivieren (bei aktiviertem Mikrofon
    // haengt sie am Berechtigungsdialog des Browsers, der beliebig lange
    // offen bleiben kann) - verhindert einen doppelten Start durch einen
    // zweiten Klick in der Zwischenzeit.
    recordBtn.disabled = true
    void viewer.startRecording(recordMicBtn.getAttribute('aria-pressed') === 'true').then(() => {
      recordBtn.disabled = false
      recordBtn.setAttribute('aria-pressed', 'true')
      recordBtn.title = t('viewer.record_stop')
      recordBtn.textContent = '⏹'
      recordPauseBtn.hidden = false
      recordPauseBtn.setAttribute('aria-pressed', 'false')
      recordPauseBtn.title = t('viewer.record_pause')
      recordPauseBtn.innerHTML = '⏸'
      // Waehrend der laufenden Aufnahme laesst sich die Tonspur nicht mehr
      // nachtraeglich hinzufuegen/entfernen - erst nach dem Stoppen wieder
      // umschaltbar (siehe oben).
      recordMicBtn.disabled = true
      // Der aeussere Kamera-Knopf (oeffnet/schliesst nur noch das Mini-Menue,
      // siehe record-menu-btn/-dropdown oben) zeigt den Aufnahmestatus per
      // aria-pressed weiterhin selbst an (rotes Pulsieren, siehe layout.css) -
      // sonst waere von aussen (bei geschlossenem Menue) gar nicht mehr zu
      // erkennen, dass gerade aufgezeichnet wird.
      recordMenuBtn.setAttribute('aria-pressed', 'true')
      recordMenuBtn.title = t('viewer.record_stop')
    })
  })
  recordPauseBtn.addEventListener('click', () => {
    if (viewer.isRecordingPaused()) {
      viewer.resumeRecording()
      recordPauseBtn.setAttribute('aria-pressed', 'false')
      recordPauseBtn.title = t('viewer.record_pause')
      recordPauseBtn.innerHTML = '⏸'
      recordBtn.classList.remove('recording-paused')
      recordMenuBtn.classList.remove('recording-paused')
    } else {
      viewer.pauseRecording()
      recordPauseBtn.setAttribute('aria-pressed', 'true')
      recordPauseBtn.title = t('viewer.record_resume')
      recordPauseBtn.innerHTML = RECORD_RESUME_ICON_SVG
      recordBtn.classList.add('recording-paused')
      recordMenuBtn.classList.add('recording-paused')
    }
  })
  recordMicBtn.addEventListener('click', () => {
    const enabled = recordMicBtn.getAttribute('aria-pressed') !== 'true'
    recordMicBtn.setAttribute('aria-pressed', String(enabled))
  })

  /** Setzt Lichtbewegung, Schnittebene, Drahtgitter, Messwerkzeug, Explosionsansicht,
   *  Transparenz, Farbsichtbarkeit und Kameraansicht auf ihre Ausgangswerte zurueck (Achsen/Glaette/
   *  Modellfarbe bleiben bewusst unangetastet — nur die zuletzt
   *  hinzugekommenen, leicht "verstellbaren" Anzeigeoptionen). Schatten
   *  werden hier nicht direkt gesetzt: applyClipping() stellt beim
   *  Deaktivieren der Schnittebene ohnehin den Zustand von davor wieder her. */
  function resetScene(): void {
    viewer.clearCollisions()
    setCollisionsActive(false)
    setCustomizerOverlayVisible(false)

    lightAutoRotateCheckbox.checked = false
    applyLightAutoRotate() // setzt dabei auch den Lichtwinkel zurueck

    clippingEnabledCheckbox.checked = false
    applyClipping() // stellt dabei auch den vorherigen Schatten-Zustand wieder her

    studioModeCheckbox.checked = false
    applyStudioMode() // stellt dabei auch den vorherigen Schatten-Zustand wieder her

    wireframeEnabled = false
    viewer.setWireframe(false)
    wireframeBtn.setAttribute('aria-pressed', 'false')

    heatmapEnabled = false
    viewer.setWallThicknessHeatmap(false)
    heatmapBtn.setAttribute('aria-pressed', 'false')

    viewer.setFlashlightEnabled(false)
    flashlightBtn.setAttribute('aria-pressed', 'false')

    setMeasureModeEnabled(false)

    explosionInput.value = '0'
    explosionEnabledCheckbox.checked = false
    applyExplosion()

    transparentBlockIds.clear()
    applyTransparency()

    exportColorOptions
      .querySelectorAll<HTMLInputElement>('input[name="export-color"]')
      .forEach((input) => {
        input.checked = true
      })
    updateExportButtonsDisabled()
    void triggerRender()

    viewer.resetView()
  }
  resetSceneBtn.addEventListener('click', resetScene)

  // Ueberstraegt die AKTUELLEN Einstellungen (nicht die Ausgangswerte) auf
  // die frisch aufgebaute Szene und holt das Modell per triggerRender()
  // zurueck (dank Render-Cache i.d.R. sofort ohne neuen Worker-Aufruf).
  reloadViewerBtn.addEventListener('click', () => {
    viewer.reload()
    // Deckt auch den Fall ab, dass der Render-WORKER selbst haengt (z.B. eine
    // nie zurueckkehrende OpenSCAD-Berechnung) - viewer.reload() allein setzt
    // nur die Three.js-Szene zurueck, ruehrt den separaten Render-Worker
    // (renderClient.ts) gar nicht an. Ohne diesen harten Abbruch (terminate()
    // via dispose()) waere der Knopf in genau diesem Fall wirkungslos: das
    // triggerRender() unten wuerde wegen renderInFlight=true (noch vom
    // haengengebliebenen alten Aufruf) nicht mal neu starten, siehe
    // Kommentar bei renderInFlight weiter unten.
    client.dispose()
    client = createRenderClient()
    renderInFlight = false
    rerenderPending = false
    setMeasureModeEnabled(false)
    viewer.setAxesVisible(axesVisible)
    applyShadows(shadowsEnabled)
    viewer.setWireframe(wireframeEnabled)
    wireframeBtn.setAttribute('aria-pressed', String(wireframeEnabled))
    viewer.setMeshColor(colorInput.value)
    applyClipping()
    viewer.setLightIntensity(Number(lightIntensityInput.value))
    // applyLightAutoRotate() setzt bei DEAKTIVIERTEM Auto-Kreisen den
    // Lichtwinkel auf lightAngleInput.defaultValue zurueck (siehe dort) - das
    // ist beim regulaeren Ausschalten gewuenscht, wuerde hier aber einen vom
    // Nutzer frei gewaehlten Winkel unbeabsichtigt ueberschreiben. Deshalb
    // nur bei AKTIVEM Auto-Kreisen darueber neu starten, sonst direkt den
    // aktuellen (nicht den Standard-)Winkel auf die frische Szene uebertragen.
    if (lightAutoRotateCheckbox.checked) {
      applyLightAutoRotate()
    } else {
      viewer.setLightAngle(Number(lightAngleInput.value))
    }
    applyExplosion()
    void triggerRender()
  })

  // Unabhaengige Icon-Popover (Farben/Export inkl. Glaette, Schnittebene,
  // Explosion, Ausleuchtung) statt eines einzelnen, bis zum unteren
  // Bildschirmrand reichenden Sammel-Menues. Nur eines gleichzeitig offen:
  // das Oeffnen eines Popovers schliesst alle anderen zuerst.
  const popoverClosers: (() => void)[] = []

  function wirePopover(
    idPrefix: string,
    onToggle?: (open: boolean) => void,
    // Elemente, deren Anklicken TROTZDEM nicht als "ausserhalb" zaehlt (das
    // Popover bleibt offen) - fuer "Ausrichten" der Viewer-Canvas selbst:
    // der Workflow besteht ja gerade daraus, wiederholt IN die 3D-Ansicht zu
    // klicken, waehrend das Popover offen bleiben soll (Anker + beliebig
    // viele Ziel-Objekte). Ohne diese Ausnahme wuerde der allererste Klick
    // auf ein Objekt das Popover sofort wieder schliessen (der Viewer-Canvas
    // liegt ausserhalb von #align-menu-wrapper) und den gerade gesetzten
    // Anker sofort zuruecksetzen.
    keepOpenFor: HTMLElement[] = [],
  ): () => void {
    const wrapper = root.querySelector<HTMLDivElement>(`#${idPrefix}-menu-wrapper`)!
    const button = root.querySelector<HTMLButtonElement>(`#${idPrefix}-menu-btn`)!
    const dropdown = root.querySelector<HTMLDivElement>(`#${idPrefix}-menu-dropdown`)!

    function close(): void {
      dropdown.hidden = true
      button.setAttribute('aria-expanded', 'false')
      onToggle?.(false)
    }
    popoverClosers.push(close)

    button.addEventListener('click', () => {
      const willOpen = dropdown.hidden
      popoverClosers.forEach((closeOther) => closeOther())
      dropdown.hidden = !willOpen
      button.setAttribute('aria-expanded', String(willOpen))
      onToggle?.(Boolean(willOpen))
    })
    document.addEventListener('click', (event) => {
      // event.composedPath() statt wrapper.contains(event.target): Klick-
      // Handler innerhalb des Popovers (siehe record-btn in wireRecordMenu-
      // artigem Code oben) koennen ihr eigenes Element waehrend derselben
      // Klick-Verarbeitung deaktivieren (z.B. recordBtn.disabled = true) -
      // Chromium liefert fuer .contains()/.isConnected in genau diesem Fall
      // fuer den Rest DESSELBEN Event-Durchlaufs faelschlich false, obwohl
      // sich am DOM nichts geaendert hat. composedPath() ist beim Dispatch
      // bereits eingefroren und bleibt davon unberuehrt.
      const path = event.composedPath()
      const isOutside = !path.includes(wrapper) && !keepOpenFor.some((el) => path.includes(el))
      if (!dropdown.hidden && isOutside) close()
    })
    return close
  }

  const closeColorsMenu = wirePopover('colors')
  wirePopover('clipping')
  wirePopover('light')
  wirePopover('explosion')
  wirePopover('record')

  function setAlignMode(mode: 'min' | 'mid' | 'max'): void {
    alignMinBtn.setAttribute('aria-pressed', String(mode === 'min'))
    alignMidBtn.setAttribute('aria-pressed', String(mode === 'mid'))
    alignMaxBtn.setAttribute('aria-pressed', String(mode === 'max'))
  }
  alignMinBtn.addEventListener('click', () => setAlignMode('min'))
  alignMidBtn.addEventListener('click', () => setAlignMode('mid'))
  alignMaxBtn.addEventListener('click', () => setAlignMode('max'))

  function setAlignAxis(axis: ClipAxis): void {
    alignAxisXBtn.setAttribute('aria-pressed', String(axis === 'x'))
    alignAxisYBtn.setAttribute('aria-pressed', String(axis === 'y'))
    alignAxisZBtn.setAttribute('aria-pressed', String(axis === 'z'))
  }
  alignAxisXBtn.addEventListener('click', () => setAlignAxis('x'))
  alignAxisYBtn.addEventListener('click', () => setAlignAxis('y'))
  alignAxisZBtn.addEventListener('click', () => setAlignAxis('z'))

  alignResetBtn.addEventListener('click', () => {
    alignAnchorId = null
    updateAlignStatus()
  })
  wirePopover(
    'align',
    (open) => {
      if (open) {
        // Klicks im Viewer sicher aktiv, unabhaengig vom "Zeiger"-Umschalter -
        // und das Messwerkzeug beendet (exklusiv, gleiches Muster wie an
        // anderen Stellen dieser Datei, z.B. beim Oeffnen des Farben-Menues).
        viewer.setBlockPickEnabled(true)
        setMeasureModeEnabled(false)
      } else {
        // Genau den Zustand wiederherstellen, den der "Zeiger"-Knopf zuletzt
        // selbst anzeigte - der Button ist bereits die einzige Quelle dafuer.
        viewer.setBlockPickEnabled(blockSelectBtn.getAttribute('aria-pressed') === 'true')
      }
      alignAnchorId = null
      updateAlignStatus()
    },
    [canvasContainer],
  )

  // Gleiches Muster wie beim Ausrichten-Popover oben: Klicks im Viewer
  // bleiben bei geoeffnetem Popover fuer die Auswahl nutzbar (kein Schliessen
  // beim Klick auf ein Objekt), Auswahl selbst bleibt aber ueber das
  // Schliessen hinweg bestehen (anders als beim Ausrichten-Anker also KEIN
  // Zuruecksetzen in onToggle).
  wirePopover(
    'transparency',
    (open) => {
      if (open) {
        viewer.setBlockPickEnabled(true)
        setMeasureModeEnabled(false)
      } else {
        viewer.setBlockPickEnabled(blockSelectBtn.getAttribute('aria-pressed') === 'true')
      }
    },
    [canvasContainer],
  )

  function getSelectedExportColorValues(): string[] {
    return Array.from(
      exportColorOptions.querySelectorAll<HTMLInputElement>('input[name="export-color"]:checked'),
    ).map((input) => input.value)
  }

  function getAllExportColorValues(): string[] {
    return Array.from(
      exportColorOptions.querySelectorAll<HTMLInputElement>('input[name="export-color"]'),
    ).map((input) => input.value)
  }

  function updateExportButtonsDisabled(): void {
    const noneSelected = getSelectedExportColorValues().length === 0
    exportStlItem.disabled = noneSelected
    embedStlItem.disabled = noneSelected
    exportGlbItem.disabled = noneSelected
  }

  // Dieselbe Auswahl steuert nicht nur, was exportiert wird, sondern auch,
  // was ueberhaupt gerendert wird (siehe triggerRender()) — ein abgehaktes
  // Faerbchen abwaehlen loest daher einen neuen Render OHNE dieses Fragment
  // aus, statt nur ein bereits berechnetes Mesh zu verstecken. Sonst haette
  // "eine Farbe ausblenden, um sich aufs Wesentliche zu konzentrieren"
  // keinerlei Geschwindigkeitsvorteil, obwohl genau das der Punkt ist.
  exportColorOptions.addEventListener('change', () => {
    updateExportButtonsDisabled()
    void triggerRender()
  })

  // "Modell einbetten": friert das aktuell sichtbare (u.U. aus vielen
  // verschachtelten Booleans/Transforms bestehende) Modell zu einem rohen
  // Dreiecksnetz ein und legt es als NEUEN os_import_stl-Block im selben
  // Projekt ab - dieselben Bytes wie beim STL-Export, nur direkt Base64-
  // kodiert in den Workspace statt auf die Festplatte geschrieben (kein
  // Umweg über Download + erneuten Datei-Import).
  async function embedCurrentModelAsStl(): Promise<void> {
    const bytes = await viewer.getStlBytes(decodeColorFilterValues(getSelectedExportColorValues()))
    if (!bytes) return
    const block = workspace.newBlock('os_import_stl')
    const state: ImportStlState = {
      filename: buildModelFilename('stl'),
      dataBase64: uint8ArrayToBase64(bytes),
    }
    block.loadExtraState?.(state)
    block.initSvg()
    block.render()
    placeNewBlock(workspace, block)
  }

  exportStlItem.addEventListener('click', () => {
    viewer.exportStl(
      decodeColorFilterValues(getSelectedExportColorValues()),
      buildModelFilename('stl'),
    )
    closeColorsMenu()
  })
  embedStlItem.addEventListener('click', () => {
    void embedCurrentModelAsStl()
    closeColorsMenu()
  })
  exportGlbItem.addEventListener('click', () => {
    void viewer.exportGlb(
      decodeColorFilterValues(getSelectedExportColorValues()),
      buildModelFilename('glb'),
    )
    closeColorsMenu()
  })
  exportScreenshotItem.addEventListener('click', () => {
    viewer.screenshot(buildImageFilename())
    closeColorsMenu()
  })
  exportFullImageItem.addEventListener('click', () => {
    viewer.exportFullImage(buildImageFilename())
    closeColorsMenu()
  })

  renderNowBtn.addEventListener('click', () => void triggerRender())

  autoCheckbox.addEventListener('change', () => {
    renderNowBtn.disabled = autoCheckbox.checked
    if (autoCheckbox.checked) void triggerRender()
  })

  qualityRadios.forEach((radio) => radio.addEventListener('change', () => void triggerRender()))

  function getQuality(): Quality {
    return (Array.from(qualityRadios).find((r) => r.checked)?.value ?? 'medium') as Quality
  }

  function setStatus(state: 'loading' | 'error' | 'success' | 'stale', text: string): void {
    status.dataset.state = state
    // Ersetzt automatisch auch evtl. noch vorhandene Fortschritts-Segmente
    // (siehe startRenderProgress) durch einen einzelnen Textknoten - kein
    // separates Aufraeumen noetig.
    status.textContent = text
    status.classList.remove('render-status-progress')
  }

  /** Baut die Statuszeile waehrend eines laufenden Renders zweizeilig auf:
   *  oben der normale Status-Text ("Rendere…"), darunter (eigene Zeile,
   *  nichts wird ueberlagert) eine Farbskala mit einem gleich breiten
   *  Segment je Fragment, das gerade an den Worker geschickt wurde (siehe
   *  client.render()s onProgress-Parameter). Die Reihenfolge der Segmente
   *  entspricht der Sendereihenfolge, das Segment ganz rechts wird also
   *  zuletzt eingefaerbt - man sieht so auf einen Blick, wie weit der Render
   *  insgesamt ist UND in welcher Farbe das jeweils gerade fertige Teil
   *  erscheinen wird. */
  function startRenderProgress(total: number, text: string): void {
    status.dataset.state = 'loading'
    status.classList.add('render-status-progress')
    status.innerHTML = `
      <span class="render-progress-label">${text}</span>
      <span class="render-progress-track"></span>
    `
    const track = status.querySelector<HTMLElement>('.render-progress-track')!
    for (let i = 0; i < total; i++) {
      const segment = document.createElement('span')
      segment.className = 'render-progress-segment'
      track.appendChild(segment)
    }
  }

  function markRenderProgress(index: number, color: string | null): void {
    const segment = status.querySelector<HTMLElement>('.render-progress-track')?.children[index]
    if (segment instanceof HTMLElement) {
      segment.style.background = color ?? colorInput.value
      segment.classList.add('render-progress-segment-done')
    }
  }

  /** Baut die Farbauswahl im Export-Menue aus den im Design tatsaechlich
   *  vorkommenden Farben neu auf (je Option ein kleines Farbkaestchen links
   *  vom Farbcode, mehrere gleichzeitig ankreuzbar fuer einen gemeinsamen
   *  Export). Bekommt bewusst die VOLLE Fragment-Liste aus
   *  generateColorFragments() statt der aktuell im Viewer geladenen Meshes:
   *  eine abgewaehlte Farbe wird gar nicht erst gerendert (siehe
   *  triggerRender()) und wuerde sonst aus der Liste verschwinden, sobald sie
   *  einmal ausgeblendet ist. Farben, die schon vorher da waren, behalten
   *  ihren An-/Abwahlstatus (auch bewusst abgewaehlte bleiben ab); eine
   *  Farbe, die vorher noch gar nicht in der Liste stand (neu benutzt), wird
   *  — genau wie die Grundfarbe beim allerersten Erscheinen — sofort
   *  aktiviert. */
  function populateExportColorSelect(fragments: RenderFragment[]): void {
    const previouslyChecked = new Set(getSelectedExportColorValues())
    const previouslyAvailable = new Set(getAllExportColorValues())
    const isFirstRender = exportColorOptions.childElementCount === 0

    const seenValues = new Set<string>()
    const distinctColors: (string | null)[] = []
    for (const fragment of fragments) {
      const value = encodeColorFilterValue(fragment.color)
      if (seenValues.has(value)) continue
      seenValues.add(value)
      distinctColors.push(fragment.color)
    }

    const rows = distinctColors.map((color) => {
      const value = encodeColorFilterValue(color)
      const swatchColor = color ?? viewer.getMeshColor()
      const label = color ?? t('viewer.export_color_default')
      const isNew = !previouslyAvailable.has(value)
      const checked = isFirstRender || isNew || previouslyChecked.has(value)
      return `<label class="export-color-option">
          <input type="checkbox" name="export-color" value="${value}"${checked ? ' checked' : ''} />
          <span class="color-swatch-mini" style="background-color: ${swatchColor}"></span>
          ${label}
        </label>`
    })
    exportColorOptions.innerHTML = rows.join('')
    updateExportButtonsDisabled()
  }

  // Wie in scene.ts (dort fuer den rAF-Loop) - ermittelt das Fenster, in dem
  // `canvasContainer` GERADE tatsaechlich angezeigt wird: das Hauptfenster
  // oder ein per Popout ausgelagertes Fenster (der Container wandert bei
  // makePopout() per appendChild() komplett dorthin, siehe popout.ts).
  // WICHTIG fuer den Render-Debounce unten: Chrome drosselt Timer in einem
  // Fenster, das von einem ANDEREN (z.B. einem maximierten Popup) komplett
  // verdeckt wird, teils extrem stark ("Occlusion Throttling") - ein per
  // globalem setTimeout() im Hauptfenster geplanter Debounce wuerde dann
  // erst wieder feuern, sobald das Hauptfenster nicht mehr verdeckt ist (z.B.
  // beim Verkleinern des Popups). Der Timer muss daher im jeweils GERADE
  // sichtbaren Fenster laufen, nicht immer im Hauptfenster.
  function currentWindow(): Window {
    return canvasContainer.ownerDocument.defaultView ?? window
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  // Merkt sich je Fragment (siehe fragmentCacheKey() - Farbe UND blockId,
  // seit generateColorFragments Fragmente nur noch INNERHALB eines
  // Top-Level-Blocks zusammenfasst, nicht mehr ueber Bloecke hinweg) den
  // zuletzt dafuer gerenderten Code + das Ergebnis (null = Fragment war leer,
  // siehe worker.ts). Wird eine Farbe nur kurz aus- und wieder eingeschaltet,
  // OHNE dass sich am Design etwas geaendert hat (Code identisch), kann das
  // alte Ergebnis direkt wiederverwendet werden — kein erneuter Render noetig.
  const renderCache = new Map<string, { code: string; rendered: RenderedFragment | null }>()

  /** Ein Fragment-Code-String allein reicht als Cache-Schluessel NICHT: der
   *  generierte OpenSCAD-Code fuer os_import_svg/os_trace_photo referenziert
   *  Asset-Inhalte nur ueber einen block-id-abgeleiteten Dateinamen (siehe
   *  codegen/blocks/tracePhoto.ts) - bei os_trace_photo kann sich der
   *  Inhalt (die nachgezeichneten Punkte) aber ueber den Nachzeichnen-Dialog
   *  AENDERN, waehrend Block-id/Dateiname/generierter Code gleich bleiben.
   *  Ohne diese Signatur wuerde ein reiner Punkt-Edit als "unveraendert"
   *  gecacht und der 3D-Viewer zeigt weiter das alte Modell an (nur ein
   *  Kopieren des Blocks, das eine neue Block-id/Dateiname erzeugt, wuerde
   *  den Cache umgehen). */
  function assetsSignature(svgAssets: RenderSvgAsset[], stlAssets: RenderStlAsset[]): string {
    const svgPart = svgAssets.map((a) => `${a.filename}:${a.svg}`).join('')
    const stlPart = stlAssets.map((a) => `${a.filename}:${a.data.byteLength}`).join('')
    return `${svgPart}${stlPart}`
  }

  // triggerRender() wird von vielen Stellen unabhaengig voneinander
  // aufgerufen (Debounce nach Workspace-Aenderung, Farbauswahl, Qualitaets-
  // Umschalter, "Jetzt rendern"-Button, ...). Frueher lief dabei jeder
  // Aufruf sofort als eigener client.render()-Durchlauf los, und nur die
  // ZULETZT gestartete Antwort wurde am Ende angezeigt (siehe
  // requestSeq-Vergleich, inzwischen entfernt) - alle waehrenddessen
  // fertig gewordenen Zwischenergebnisse wurden verworfen. Beim
  // schrittweisen Bauen durch den KI-Agenten (ein Blockly-Change-Event pro
  // Bauschritt, staendig neue Debounce-Anstoesse) dauert ein einzelner
  // Render oft laenger als der Abstand zwischen zwei Bauschritten - dadurch
  // wurde JEDER Render durch den naechsten ueberholt, bevor er fertig war,
  // und im Viewer war bis zum allerletzten Schritt ueberhaupt keine
  // Aenderung zu sehen (siehe Nutzer-Beobachtung mit aktivem "Auto"-Render
  // waehrend eines Agent-Baus).
  //
  // Jetzt laeuft immer nur EIN client.render() gleichzeitig: trifft waehrend
  // eines laufenden Renders ein weiterer Aufruf ein, wird nur vorgemerkt,
  // dass danach noch einmal (und zwar nur EIN einziges Mal, mit dem dann
  // aktuellen Stand) nachgerendert werden soll. Das fertige Ergebnis jedes
  // Durchlaufs wird immer angezeigt statt verworfen - der Viewer zeigt so
  // laufend echte Zwischenstaende statt am Ende ploetzlich alles auf einmal.
  let renderInFlight = false
  let rerenderPending = false
  // Gesetzt vom Workspace-Change-Listener unten, sobald ein FINISHED_LOADING-
  // Event durchkommt (Blockly.serialization.workspaces.load(), z.B. beim
  // "Laden" eines Projekts oder Oeffnen eines Tutorials/BlockSCAD-Imports) -
  // laesst den naechsten runRender()-Durchlauf das frisch geladene Modell
  // sichtbar von oben einfallen ("bounce", siehe MeshManager.dropIn()),
  // statt es kommentarlos an Ort und Stelle erscheinen zu lassen. Wird direkt
  // beim Verbrauch in runRender() zurueckgesetzt, nicht separat "nach dem
  // Rendern" - ein zwischenzeitlich fehlgeschlagener Render soll den Effekt
  // nicht fuer den naechsten (erfolgreichen) Versuch aufheben.
  let pendingDropIn = false

  async function triggerRender(): Promise<void> {
    if (renderInFlight) {
      rerenderPending = true
      return
    }
    renderInFlight = true
    try {
      do {
        rerenderPending = false
        await runRender()
      } while (rerenderPending)
    } finally {
      renderInFlight = false
    }
    // Kollisionsueberwachung ist eingeschaltet -> nach dem Render (neue
    // Geometrie) automatisch neu auswerten, statt dass der Nutzer sie nach
    // jeder Aenderung erneut anstossen muss.
    if (collisionsActive) void checkCollisions()
  }

  async function runRender(): Promise<void> {
    // Direkt zu Beginn verbrauchen (nicht erst kurz vor showMesh()): ein
    // waehrend dieses Durchlaufs erneut eintreffendes FINISHED_LOADING soll
    // nicht verloren gehen, aber dieser Durchlauf selbst soll konsistent nur
    // EINMAL entscheiden, ob er dropIn zeigt.
    const dropIn = pendingDropIn
    pendingDropIn = false
    // Ein evtl. angezeigtes Kollisions-Ergebnis bezieht sich auf den ZULETZT
    // gerenderten Stand - sobald sich am Design etwas aendert, ist es
    // potenziell veraltet (die betroffenen Teile koennten sich inzwischen gar
    // nicht mehr ueberschneiden oder umgekehrt). Die Ueberwachung selbst
    // bleibt aber eingeschaltet (siehe triggerRender()), das Ergebnis wird
    // nach diesem Render automatisch neu berechnet.
    viewer.clearCollisions()
    const { fragments, definitionsPreamble } = generateColorFragments(workspace)
    // Farbauswahl-Liste immer aus der VOLLEN Fragment-Liste aufbauen (auch
    // aktuell abgewaehlte Farben bleiben so waehlbar), aber nur die gerade
    // angehakten Farben tatsaechlich rendern — eine abgewaehlte Farbe kostet
    // dadurch keine Renderzeit mehr, statt nur hinterher ausgeblendet zu werden.
    populateExportColorSelect(fragments)
    const selectedColors = new Set(getSelectedExportColorValues())
    const visibleFragments = fragments.filter((fragment) =>
      selectedColors.has(encodeColorFilterValue(fragment.color)),
    )

    const fn = QUALITY_FN[getQuality()]
    const fnPrefix = fn ? `$fn = ${fn};\n` : ''
    const codeFragments = visibleFragments.map((fragment) => {
      // fragment.code traegt definitionsPreamble bereits an seinem Anfang
      // (siehe generateColorFragments()) - fuer die Vorschau-Variante muss
      // NUR die eigentliche Geometrie in linear_extrude landen, nicht die
      // Praeambel: Modul-/Funktionsdefinitionen sind innerhalb eines
      // Transform-Blocks kein gueltiges OpenSCAD (Syntaxfehler).
      const geometry = fragment.code.slice(definitionsPreamble.length)
      return {
        color: fragment.color,
        blockId: fragment.blockId,
        code: `${fnPrefix}${fragment.code}`,
        previewCode: `${definitionsPreamble}${fnPrefix}linear_extrude(height=${PREVIEW_2D_HEIGHT_MM}) {\n${geometry}}\n`,
      }
    })

    // VOR dem Cache-Vergleich einsammeln (nicht erst nach dem
    // toRender.length===0-Fruehausstieg) - die Signatur muss bereits fuer
    // den Vergleich selbst vorliegen (siehe assetsSignature()).
    const svgAssets = collectSvgAssets(workspace)
    const stlAssets = collectStlAssets(workspace)
    const signature = assetsSignature(svgAssets, stlAssets)
    const cacheKeyFor = (code: string): string => `${code}|${signature}`

    const cachedResults: RenderedFragment[] = []
    const toRender: RenderCodeFragment[] = []
    for (const fragment of codeFragments) {
      const key = fragmentCacheKey(fragment)
      const cached = renderCache.get(key)
      if (cached && cached.code === cacheKeyFor(fragment.code)) {
        if (cached.rendered) cachedResults.push(cached.rendered)
      } else {
        toRender.push(fragment)
      }
    }

    if (toRender.length === 0) {
      // Alles kam aus dem Cache (z.B. reines An-/Abwaehlen von Farben ohne
      // Aenderung am Design) - kein Worker-Aufruf noetig.
      setStatus('success', '')
      viewer.showMesh(cachedResults, dropIn)
      // Unabhaengig vom Cache-Kurzschluss: die "auf Objekt projizieren"-
      // Checkbox aendert den generierten OpenSCAD-Code nicht, muss also auch
      // dann aktualisiert werden, wenn kein neuer WASM-Render noetig war.
      void viewer.setPhotoProjections(collectPhotoProjections(workspace))
      return
    }

    startRenderProgress(toRender.length, 'Rendere…')

    const result = await client.render(toRender, svgAssets, stlAssets, (index, _total, color) =>
      markRenderProgress(index, color),
    )

    if (result.status === 'success') {
      setStatus('success', '')
      for (const fragment of toRender) {
        const key = fragmentCacheKey(fragment)
        const rendered = result.fragments.find((f) => fragmentCacheKey(f) === key) ?? null
        renderCache.set(key, { code: cacheKeyFor(fragment.code), rendered })
      }
      viewer.showMesh([...cachedResults, ...result.fragments], dropIn)
      void viewer.setPhotoProjections(collectPhotoProjections(workspace))
    } else {
      const location = result.line ? ` (Zeile ${result.line})` : ''
      setStatus('error', `Fehler${location}: ${result.message}`)
      // Bewusst KEIN viewer.clear(): das zuletzt erfolgreich gerenderte
      // Modell bleibt sichtbar, statt bei jedem (evtl. nur kurzzeitig
      // ungueltigen, z.B. waehrend des Tippens) Fehler zu verschwinden.
    }
  }

  /** "Jetzt pruefen"-Kollisionscheck: baut fuer JEDES Paar sichtbarer
   *  Farb-Fragmente ein `intersection() { union(){A} union(){B} }`-Programm
   *  und schickt alle Paare in EINEM Rutsch an den Render-Worker. Ein Paar,
   *  das dabei tatsaechlich Geometrie liefert, ueberschneidet sich - der
   *  Worker liefert fuer ein leeres Ergebnis (siehe worker.ts,
   *  EMPTY_OBJECT_MESSAGE) ohnehin gar kein Fragment zurueck, das muss hier
   *  also nicht separat erkannt werden. Nutzt bewusst dieselbe
   *  renderInFlight-Sperre wie triggerRender() - ein waehrenddessen
   *  eintreffender echter Render-Wunsch (Design-Aenderung) wird wie gewohnt
   *  vorgemerkt statt gleichzeitig in denselben Worker zu laufen. */
  async function checkCollisions(): Promise<void> {
    if (renderInFlight) return
    renderInFlight = true
    checkCollisionsBtn.disabled = true
    // Die Ueberschneidung wird aus dem OpenSCAD-Code berechnet (immer an den
    // WAHREN, nicht auseinandergezogenen Positionen) - bei aktiver
    // Explosionsansicht wuerden die betroffenen Teile im Viewer aber versetzt
    // dargestellt, sodass die Warn-Markierung scheinbar frei schwebend und
    // an keinem der beiden Teile sichtbar erscheint. Deshalb hier immer
    // ausschalten, nicht nur ausblenden - eine Kollisionspruefung UND eine
    // auseinandergezogene Ansicht schliessen sich gegenseitig aus.
    explosionInput.value = '0'
    explosionEnabledCheckbox.checked = false
    applyExplosion()
    try {
      const { fragments, definitionsPreamble } = generateColorFragments(workspace)
      const selectedColors = new Set(getSelectedExportColorValues())
      const visible = fragments.filter((fragment) =>
        selectedColors.has(encodeColorFilterValue(fragment.color)),
      )

      if (visible.length < 2) {
        viewer.clearCollisions()
        setStatus('success', t('viewer.collisions_none'))
        return
      }

      setStatus('loading', t('viewer.collisions_checking'))
      const fn = QUALITY_FN[getQuality()]
      const withQuality = (code: string): string => (fn ? `$fn = ${fn};\n${code}` : code)
      // fragment.code traegt definitionsPreamble (alle module/function-
      // Definitionen) selbst schon vorangestellt (siehe generateColorFragments)
      // - direkt in union() hineinkopiert waere das ein Syntaxfehler (Modul-
      // /Funktionsdefinitionen sind in OpenSCAD nur auf oberster Ebene
      // gueltig). Deshalb hier abgeschnitten und stattdessen EINMAL vor die
      // gesamte Paar-Pruefung gesetzt, nur die reine Geometrie kommt in die
      // union()-Huellen.
      const stripPreamble = (code: string): string => code.slice(definitionsPreamble.length)
      const pairFragments: RenderCodeFragment[] = []
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = withQuality(stripPreamble(visible[i].code))
          const b = withQuality(stripPreamble(visible[j].code))
          pairFragments.push({
            code: `${definitionsPreamble}intersection() {\n  union() {\n${a}}\n  union() {\n${b}}\n}\n`,
            // Kein echter Farbwert - dient hier nur als undurchsichtiger
            // Schluessel, um ein zurueckkommendes Fragment seinem Paar
            // zuzuordnen (der Worker reicht `color` unveraendert durch,
            // siehe worker.ts).
            color: `${i}:${j}`,
          })
        }
      }

      const svgAssets = collectSvgAssets(workspace)
      const stlAssets = collectStlAssets(workspace)
      const result = await client.render(pairFragments, svgAssets, stlAssets)

      if (result.status !== 'success') {
        viewer.clearCollisions()
        setStatus('error', result.message)
        return
      }

      if (result.fragments.length === 0) {
        viewer.clearCollisions()
        setStatus('success', t('viewer.collisions_none'))
      } else {
        viewer.showCollisions(result.fragments.map((fragment) => fragment.stl))
        setCollisionsActive(true)
        const colorLabel = (hex: string | null): string => hex ?? t('viewer.export_color_default')
        const pairLabels = result.fragments.map((fragment) => {
          const [i, j] = fragment.color!.split(':').map(Number)
          return `${colorLabel(visible[i].color)} ↔ ${colorLabel(visible[j].color)}`
        })
        // Bei vielen betroffenen Paaren wuerde die Statuszeile unlesbar lang -
        // ab der Obergrenze werden die restlichen nur noch gezaehlt, nicht
        // mehr einzeln aufgefuehrt (im Viewer blinken ohnehin ALLE weiterhin).
        const shown = pairLabels.slice(0, MAX_COLLISION_PAIR_LABELS)
        const rest = pairLabels.length - shown.length
        const suffix = rest > 0 ? `, +${rest} ${t('viewer.collisions_more')}` : ''
        setStatus(
          'error',
          `${result.fragments.length} ${t('viewer.collisions_found')}: ${shown.join(', ')}${suffix}`,
        )
      }
    } finally {
      checkCollisionsBtn.disabled = false
      renderInFlight = false
      if (rerenderPending) void triggerRender()
    }
  }

  // Waehrend das Modul-"Einstellungen"-Zahnrad (Mutator-Fenster fuer
  // Parameter/Variablen) offen ist, feuert Blockly pro Tastendruck beim
  // Eintippen eines Parameternamens ein VAR_CREATE (siehe
  // mutatorVariableCleanup.ts) - das ist weder isUiEvent noch ein
  // BLOCK_FIELD_INTERMEDIATE_CHANGE, rutscht also durch beide Filter unten
  // und wuerde sonst bei JEDEM Tastendruck neu rendern. Stattdessen: waehrend
  // der Mutator offen ist, gar nicht rendern, sondern erst einmal, sobald er
  // wieder geschlossen wird.
  // Ein komplett geleerter Workspace (z.B. "Löschen"/"Neues Design", aber
  // auch das manuelle Entfernen des letzten uebrigen Blocks) hat unzweideutig
  // NICHTS mehr zu rendern - anders als bei jeder anderen Aenderung ist hier
  // "stale, alte Ansicht bleibt bis zum naechsten manuellen Render stehen"
  // (siehe autoCheckbox-Abfragen unten) nie sinnvoll: die Vorschau wuerde
  // sonst ein laengst geloeschtes Design weiter anzeigen. Greift deshalb
  // IMMER, unabhaengig vom "Auto"-Haken.
  function resetPreviewIfWorkspaceEmpty(): boolean {
    if (workspace.getTopBlocks(false).length > 0) return false
    currentWindow().clearTimeout(debounceTimer)
    viewer.clear()
    viewer.clearCollisions()
    setCollisionsActive(false)
    setStatus('success', '')
    return true
  }

  let mutatorOpen = false
  workspace.addChangeListener((event) => {
    if (event instanceof Blockly.Events.BubbleOpen && event.bubbleType === 'mutator') {
      mutatorOpen = Boolean(event.isOpen)
      if (mutatorOpen) return
      if (resetPreviewIfWorkspaceEmpty()) return
      if (!autoCheckbox.checked) {
        setStatus('stale', t('viewer.stale'))
        return
      }
      currentWindow().clearTimeout(debounceTimer)
      debounceTimer = currentWindow().setTimeout(() => void triggerRender(), DEBOUNCE_MS)
      return
    }
    if (mutatorOpen) return
    if (event.isUiEvent) return
    // Blockly.serialization.workspaces.load() feuert dieses Event ganz am
    // Ende des Deserialisierens (z.B. "Laden" eines Projekts, ein Tutorial
    // aus den Samples oder ein BlockSCAD-Import) - kein return hier, das Ganze
    // soll ganz normal weiter unten in den bestehenden Debounce laufen,
    // dieses Flag merkt sich nur zusaetzlich, dass der DANACH folgende Render
    // das frisch geladene Modell von oben einfallen lassen soll.
    if (event.type === Blockly.Events.FINISHED_LOADING) pendingDropIn = true
    // Waehrend ein Zahlen-/Textfeld noch aktiv editiert wird, feuert Blockly
    // pro Tastendruck ein BLOCK_FIELD_INTERMEDIATE_CHANGE (isUiEvent=false,
    // rutscht also durch den Filter oben) - erst beim Verlassen des Feldes
    // (Blur/Enter) kommt das eigentliche CHANGE-Event. Ohne diesen Filter
    // rendert z.B. "30" schon nach der "3", die "0" ueberholt den noch
    // laufenden Render und wirkt dadurch ignoriert.
    if (event.type === Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE) return
    if (resetPreviewIfWorkspaceEmpty()) return
    if (!autoCheckbox.checked) {
      setStatus('stale', t('viewer.stale'))
      return
    }
    currentWindow().clearTimeout(debounceTimer)
    debounceTimer = currentWindow().setTimeout(() => void triggerRender(), DEBOUNCE_MS)
  })

  // Beim Aus-/Einklappen ins Popup-Fenster (und bei dessen Groessenaenderung,
  // z.B. per Maximieren-Knopf) muss der Canvas neu vermessen werden. Ein
  // abruptes Maximieren liefert clientWidth/clientHeight teils erst nach
  // mehreren Frames zuverlaessig — daher mehrfach ueber ein kurzes
  // Zeitfenster neu vermessen statt nur einmal kurz nach dem Event.
  // restartAnimation(): falls das Popup-Fenster geschlossen wurde, waehrend
  // gerade ein Frame darueber eingeplant war, ist die Animationsschleife
  // sonst komplett tot — hier garantiert neu gestartet.
  viewerPopout?.onToggle(() => {
    viewer.restartAnimation()
    ;[0, 50, 150, 300, 600].forEach((delay) => setTimeout(() => viewer.resize(), delay))
  })

  const popoutBtn = root.querySelector<HTMLButtonElement>('#popout-viewer-btn')!
  viewerPopout?.onToggle((open) => {
    popoutBtn.setAttribute('aria-pressed', String(open))
    const label = open ? t('popout_viewer.close') : t('popout_viewer.open')
    popoutBtn.title = label
    popoutBtn.setAttribute('aria-label', label)
    popoutBtn.innerHTML = open ? EMBED_ICON_SVG : POPOUT_ICON_SVG
  })
  popoutBtn.addEventListener('click', () => viewerPopout?.toggle())

  // Frueher wurde der Customizer im ausgelagerten Popup-Fenster komplett
  // deaktiviert (Knopf versteckt) - der zugrunde liegende Blockly-Workspace
  // ist dabei ein separates Browserfenster entfernt, was sich damals als
  // unzuverlaessig zeigte. Ursache war ein "instanceof HTMLInputElement"-
  // Check auf im Popup neu erzeugten <input>-Elementen (die gehoeren zu
  // einer ANDEREN JS-Realitaet mit eigenem HTMLInputElement-Konstruktor,
  // "instanceof" schlug daher faelschlich fehl) - inzwischen behoben (siehe
  // isInputElement() in customizerBody.ts, nutzt tagName statt instanceof).
  // Das Overlay bleibt daher jetzt auch im Popup nutzbar, inkl. nach dem
  // Maximieren des Popup-Fensters (mit Rasterprojekt customize_box_001.json
  // verifiziert: Regler-Aenderung im Popup schreibt korrekt in den Block
  // zurueck und stoesst einen erfolgreichen Re-Render an). Bewusst KEIN
  // "beim Aus-/Einklappen schliessen" mehr (das gab es hier zwischenzeitlich):
  // popout.ts::onToggle() feuert nicht nur beim tatsaechlichen Ein-/Ausklappen,
  // sondern bei JEDER Groessenaenderung des bereits offenen Popup-Fensters
  // (siehe win.addEventListener('resize', () => notify(true)) dort) - u.a.
  // beim nativen Maximieren-Knopf des Betriebssystems. Ein "schliessen bei
  // jedem Toggle" haette den gerade erst geoeffneten Customizer also exakt in
  // dem Moment wieder zugeklappt, in dem man das Popup-Fenster maximiert -
  // das reine HTML/CSS-Overlay braucht dafuer ohnehin keine Sonderbehandlung,
  // es reagiert wie jeder andere Seiteninhalt von selbst auf die neue Groesse.

  void triggerRender()
}
