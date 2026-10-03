import * as Blockly from 'blockly'
import type { BlockSvg, WorkspaceSvg } from 'blockly'
import { t } from '../i18n'
import { placeNewBlock } from './placeNewBlock'
import { tracePathData, type TracePoint, type TracePhotoState } from '../editor/blocks/tracePhoto'

// In CSS-Pixeln gemessen, dann ueber den aktuellen Canvas-Massstab (siehe
// toNatural()) in den echten Foto-Koordinatenraum umgerechnet - so bleiben
// die Schwellwerte unabhaengig davon, wie stark die Dialog-CSS-Groesse das
// Foto gerade herunterskaliert.
const DRAG_THRESHOLD_CSS_PX = 4
const CLOSE_HIT_RADIUS_CSS_PX = 10

const ROTATE_STEP_DEGREES = 5
const ZOOM_STEP_PERCENT = 25
const ZOOM_MIN_PERCENT = 50
const ZOOM_MAX_PERCENT = 300

// In natuerlichen Canvas-Pixeln (dieselbe Einheit wie canvas.width/height,
// nicht CSS-/Zoom-relativ) - direkt verstaendlich als "so und so viele Pixel
// dick" statt eines abstrakten Prozentwerts.
const LINE_WIDTH_STEP_PX = 1
const LINE_WIDTH_MIN_PX = 1
const LINE_WIDTH_MAX_PX = 60
const DEFAULT_STROKE_COLOR = '#3b6fe0'

// Beim "Fertig"-Commit wird das Foto NEU aus dem aktuellen Dreh-/Auffuell-
// Zustand exportiert (siehe bakePhoto()) statt einfach die urspruenglich
// geladene data:-URL weiterzureichen - re-encodiert daher ein zweites Mal
// (erste Kompression passiert schon beim Hochladen, siehe
// photoDownscale.ts). Etwas hoehere Qualitaet als dort, um sichtbaren
// Generationsverlust durch die doppelte JPEG-Kompression gering zu halten.
const EXPORT_JPEG_QUALITY = 0.9

// Gleiche Icons/Begruendung wie viewerPanel.ts::POPOUT_ICON_SVG/EMBED_ICON_SVG
// (dort auch das Original-Vorbild fuer den Auslager-Mechanismus in popOut()
// unten) - Unicode-Kandidaten sind auch hier das bekannte Tofu-Risiko in
// manchen Umgebungen.
const POPOUT_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/><path d="M9 2h5v5"/><path d="M14 2L7 9"/></svg>'
const EMBED_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"/><path d="M8 3v4h4"/><path d="M14 1L8 7"/></svg>'
// Drei waagrechte Striche mit abnehmender Dicke (dick/mittel/duenn) - reines
// Label-Icon zwischen den +/- Knoepfen der Linienstaerke, aehnlich den
// Stiftstaerke-Auswahlsymbolen bekannter Zeichenprogramme. Der tatsaechliche
// Zahlenwert (in px) steht direkt daneben im Label, siehe
// updateLineWidthDisplay().
const LINE_WIDTH_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true"><rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="11" width="14" height="1" rx="0.5"/></svg>'
// Offene Hand (Palm + 4 zusammengefasste Finger als ein Pfad) fuer den
// "Punkte verschieben"-Modus - schaltet Einfuegen/Entfernen wieder auf den
// normalen Ziehen-Modus zurueck (siehe togglePointEditMode() -> 'move').
const HAND_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true"><path d="M6 2.3a1 1 0 0 1 2 0V7h.3V1.8a1 1 0 0 1 2 0V7h.3V2.8a1 1 0 0 1 2 0V9.5c0 2.9-1.8 4.7-4.4 4.7H7.6c-1.4 0-2.2-.4-3-1.6L2.6 9.4a1 1 0 0 1 1.6-1.2L6 10.3V2.3Z"/></svg>'
// Drei Icons fuer den Segmenttyp-Umschalter (siehe pointType): einfache
// gerade Diagonale, eine Kurve MIT sichtbarem gestricheltem Kontrollpunkt-
// Griff (klassisches Bezier-Werkzeug-Symbol) und eine durchgehend weiche
// Welle durch mehrere Punkte (verdeutlicht "glatt durch mehrere Punkte",
// im Unterschied zum EINEN gezogenen Bezier-Griff).
const LINE_TYPE_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><line x1="2.5" y1="13" x2="13.5" y2="3"/></svg>'
const BEZIER_TYPE_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M2 13C6 13 5 3 14 3"/><line x1="5.3" y1="13" x2="9.3" y2="5.8" stroke-dasharray="1.4 1.4"/><circle cx="9.3" cy="5.8" r="1.2" fill="currentColor" stroke="none"/></svg>'
const BSPLINE_TYPE_ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M1.5 11C4 11 4 5 6.5 5S9 11 11.5 11 14 5 14.5 5"/><circle cx="1.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="6.5" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="11.5" cy="11" r="1" fill="currentColor" stroke="none"/></svg>'

export interface NewPhoto {
  photoDataUrl: string
  width: number
  height: number
}

export interface TracePhotoDialogHandle {
  openForNew(photo: NewPhoto): void
  openForEdit(block: BlockSvg, state: TracePhotoState): void
}

interface Point {
  x: number
  y: number
}

/** Punkt-Bearbeitungsmodus, nur relevant sobald der Pfad geschlossen ist
 *  (siehe pointerdown-Handler): 'move' (Standard) haengt einen bestehenden
 *  Punkt beim Klicken+Ziehen an den Zeiger, 'insert'/'delete' werden ueber
 *  die +/- Werkzeuge im Toolbar umgeschaltet. */
type PointEditMode = 'move' | 'insert' | 'delete'

/** Welche Art von Segment ein Klick (bzw. ein per Einfuegen-Werkzeug neu
 *  eingefuegter Punkt) erzeugt - siehe pointType-Zustand weiter unten:
 *  - 'line': IMMER eine gerade Linie, Ziehen wird ignoriert (auch wenn der
 *    Zeiger dabei bewegt wurde).
 *  - 'bezier': das bisherige gemischte Verhalten (Klicken = gerade Linie,
 *    Klicken+Ziehen = quadratische Bezierkurve mit dem gezogenen Punkt als
 *    Kontrollpunkt).
 *  - 'bspline': IMMER ein `smooth: true`-Punkt (kein Ziehen noetig) - die
 *    tatsaechliche Kurve wird automatisch aus den Nachbarpunkten berechnet
 *    (siehe tracePathData()/catmullRomControlPoints() in tracePhoto.ts). */
type PointType = 'line' | 'bezier' | 'bspline'

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Kuerzester Abstand von `p` zur Strecke a-b (fuer Kurvensegmente wird die
 *  Sehne genutzt statt der echten Bezierkurve - reicht fuer "naechstgelegenes
 *  Segment beim Einfuegen finden" voellig aus und bleibt einfach). */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** Bounding-Box, die das (unrotierte) Foto mit den gegebenen Massen bei der
 *  angegebenen Drehung OHNE Beschnitt aufnimmt - der Canvas wird beim Drehen
 *  auf genau diese Groesse vergroessert/verkleinert (Auffuell-Ecken statt
 *  abgeschnittener Bildecken). */
function rotatedBoundingBox(width: number, height: number, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  return {
    x: Math.round(width * cos + height * sin),
    y: Math.round(width * sin + height * cos),
  }
}

/** Dreht einen Punkt um `deltaDegrees` um `oldCenter` und verschiebt ihn
 *  anschliessend relativ zu `newCenter` - so lassen sich bereits gesetzte
 *  Ankerpunkte beim Drehen des Fotos in den (groesseren/kleineren) neuen
 *  Canvas-Koordinatenraum mitnehmen, statt beim naechsten Dreh-Klick
 *  verschoben zu wirken. */
function rotateAround(p: Point, oldCenter: Point, newCenter: Point, deltaDegrees: number): Point {
  const rad = (deltaDegrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - oldCenter.x
  const dy = p.y - oldCenter.y
  return {
    x: newCenter.x + dx * cos - dy * sin,
    y: newCenter.y + dx * sin + dy * cos,
  }
}

/** Der eigentliche Stift-Dialog: Foto als Hintergrund, Klick = gerader Punkt,
 *  Klick+Ziehen = kurviger Punkt (ein Kontrollpunkt pro Kurvensegment,
 *  bewusst einfach gehalten statt unabhaengiger Ein-/Ausgangsgriffe wie in
 *  Illustrator). Schliessen durch Klick auf den ersten Punkt (ab 3 Punkten).
 *  Zoom (+/-) skaliert nur die CSS-Anzeigegroesse (der umgebende Wrapper
 *  scrollt bei Bedarf) - die Foto-Pixel-Koordinaten der Punkte bleiben
 *  unangetastet, da toNatural()/cssScale() den aktuellen Massstab ohnehin
 *  bei jedem Zeigerereignis frisch aus getBoundingClientRect() lesen. Drehen
 *  (±5°) vergroessert dagegen den Canvas selbst (Auffuell-Ecken statt
 *  Beschnitt) und muss deshalb bereits gesetzte Punkte aktiv mitverschieben
 *  (rotateAround). Sobald der Pfad geschlossen ist, schaltet die Bedienung
 *  auf Punkt-Bearbeitung um (siehe PointEditMode): per Default kann ein
 *  bestehender Punkt durch Ziehen verschoben werden, die +/- Werkzeuge
 *  schalten auf Einfuegen (naechstgelegenes Segment) bzw. Entfernen
 *  (Mindestens 3 Punkte bleiben erhalten, sonst waere der Pfad kein Polygon
 *  mehr). */
export function mountTracePhotoDialog(workspace: WorkspaceSvg): TracePhotoDialogHandle {
  const dialog = document.createElement('dialog')
  dialog.className = 'info-dialog trace-photo-dialog'
  dialog.innerHTML = `
    <div class="trace-photo-dialog-content">
      <div class="trace-photo-dialog-header">
        <h2>${t('trace_photo.title')}</h2>
        <button type="button" class="btn btn-icon" id="trace-photo-popout-btn" aria-pressed="false" title="${t('trace_photo.popout_open')}" aria-label="${t('trace_photo.popout_open')}">${POPOUT_ICON_SVG}</button>
      </div>
      <p>${t('trace_photo.hint')}</p>
      <div class="trace-photo-toolbar">
        <div class="trace-photo-tool-group">
          <button type="button" class="btn btn-icon" id="trace-point-type-line-btn" title="${t('trace_photo.point_type_line')}" aria-label="${t('trace_photo.point_type_line')}" aria-pressed="false">${LINE_TYPE_ICON_SVG}</button>
          <button type="button" class="btn btn-icon" id="trace-point-type-bezier-btn" title="${t('trace_photo.point_type_bezier')}" aria-label="${t('trace_photo.point_type_bezier')}" aria-pressed="true">${BEZIER_TYPE_ICON_SVG}</button>
          <button type="button" class="btn btn-icon" id="trace-point-type-bspline-btn" title="${t('trace_photo.point_type_bspline')}" aria-label="${t('trace_photo.point_type_bspline')}" aria-pressed="false">${BSPLINE_TYPE_ICON_SVG}</button>
        </div>
        <div class="trace-photo-tool-group">
          <button type="button" class="btn btn-icon" id="trace-insert-point-btn" title="${t('trace_photo.insert_point')}" aria-label="${t('trace_photo.insert_point')}" aria-pressed="false" disabled>+</button>
          <button type="button" class="btn btn-icon" id="trace-move-point-btn" title="${t('trace_photo.move_point')}" aria-label="${t('trace_photo.move_point')}" aria-pressed="true" disabled>${HAND_ICON_SVG}</button>
          <button type="button" class="btn btn-icon" id="trace-delete-point-btn" title="${t('trace_photo.delete_point')}" aria-label="${t('trace_photo.delete_point')}" aria-pressed="false" disabled>−</button>
        </div>
        <span class="trace-photo-toolbar-spacer"></span>
        <div class="trace-photo-tool-group">
          <button type="button" class="btn btn-icon" id="trace-rotate-left-btn" title="${t('trace_photo.rotate_left')}" aria-label="${t('trace_photo.rotate_left')}">⟲</button>
          <button type="button" class="btn btn-icon" id="trace-rotate-right-btn" title="${t('trace_photo.rotate_right')}" aria-label="${t('trace_photo.rotate_right')}">⟳</button>
        </div>
        <div class="trace-photo-tool-group">
          <button type="button" class="btn btn-icon" id="trace-zoom-out-btn" title="${t('trace_photo.zoom_out')}" aria-label="${t('trace_photo.zoom_out')}">−</button>
          <span class="trace-photo-zoom-label" id="trace-zoom-label">100%</span>
          <button type="button" class="btn btn-icon" id="trace-zoom-in-btn" title="${t('trace_photo.zoom_in')}" aria-label="${t('trace_photo.zoom_in')}">+</button>
        </div>
        <input type="color" class="trace-photo-color-input" id="trace-color-input" value="${DEFAULT_STROKE_COLOR}" title="${t('trace_photo.line_color')}" aria-label="${t('trace_photo.line_color')}">
        <div class="trace-photo-tool-group">
          <span class="trace-photo-line-width-icon" aria-hidden="true">${LINE_WIDTH_ICON_SVG}</span>
          <button type="button" class="btn btn-icon" id="trace-line-width-in-btn" title="${t('trace_photo.line_width_in')}" aria-label="${t('trace_photo.line_width_in')}">+</button>
          <span class="trace-photo-zoom-label" id="trace-line-width-label">3px</span>
          <button type="button" class="btn btn-icon" id="trace-line-width-out-btn" title="${t('trace_photo.line_width_out')}" aria-label="${t('trace_photo.line_width_out')}">−</button>
        </div>
      </div>
      <div class="trace-photo-canvas-wrap">
        <canvas class="trace-photo-canvas"></canvas>
      </div>
      <form class="confirm-dialog-actions">
        <button type="button" class="btn" id="trace-undo-btn">${t('trace_photo.undo')}</button>
        <button type="button" class="btn" id="trace-clear-btn">${t('trace_photo.clear')}</button>
        <button type="button" class="btn" id="trace-cancel-btn">${t('trace_photo.cancel')}</button>
        <button type="button" class="btn" id="trace-done-btn" disabled>${t('trace_photo.done')}</button>
      </form>
    </div>
  `
  document.body.appendChild(dialog)
  const contentWrapper = dialog.querySelector<HTMLDivElement>('.trace-photo-dialog-content')!
  const popoutBtn = dialog.querySelector<HTMLButtonElement>('#trace-photo-popout-btn')!
  const canvasWrap = dialog.querySelector<HTMLDivElement>('.trace-photo-canvas-wrap')!
  const canvas = dialog.querySelector<HTMLCanvasElement>('canvas')!
  const ctx = canvas.getContext('2d')!
  const undoBtn = dialog.querySelector<HTMLButtonElement>('#trace-undo-btn')!
  const clearBtn = dialog.querySelector<HTMLButtonElement>('#trace-clear-btn')!
  const cancelBtn = dialog.querySelector<HTMLButtonElement>('#trace-cancel-btn')!
  const doneBtn = dialog.querySelector<HTMLButtonElement>('#trace-done-btn')!
  const rotateLeftBtn = dialog.querySelector<HTMLButtonElement>('#trace-rotate-left-btn')!
  const rotateRightBtn = dialog.querySelector<HTMLButtonElement>('#trace-rotate-right-btn')!
  const zoomInBtn = dialog.querySelector<HTMLButtonElement>('#trace-zoom-in-btn')!
  const zoomOutBtn = dialog.querySelector<HTMLButtonElement>('#trace-zoom-out-btn')!
  const zoomLabel = dialog.querySelector<HTMLSpanElement>('#trace-zoom-label')!
  const insertPointBtn = dialog.querySelector<HTMLButtonElement>('#trace-insert-point-btn')!
  const movePointBtn = dialog.querySelector<HTMLButtonElement>('#trace-move-point-btn')!
  const deletePointBtn = dialog.querySelector<HTMLButtonElement>('#trace-delete-point-btn')!
  const pointTypeLineBtn = dialog.querySelector<HTMLButtonElement>('#trace-point-type-line-btn')!
  const pointTypeBezierBtn = dialog.querySelector<HTMLButtonElement>(
    '#trace-point-type-bezier-btn',
  )!
  const pointTypeBsplineBtn = dialog.querySelector<HTMLButtonElement>(
    '#trace-point-type-bspline-btn',
  )!
  const colorInput = dialog.querySelector<HTMLInputElement>('#trace-color-input')!
  const lineWidthInBtn = dialog.querySelector<HTMLButtonElement>('#trace-line-width-in-btn')!
  const lineWidthOutBtn = dialog.querySelector<HTMLButtonElement>('#trace-line-width-out-btn')!
  const lineWidthLabel = dialog.querySelector<HTMLSpanElement>('#trace-line-width-label')!

  let currentBlock: BlockSvg | null = null
  let photoImage = new Image()
  // Massse des ORIGINAL geladenen Fotos (unrotiert) - bleiben waehrend der
  // ganzen Sitzung konstant, anders als canvas.width/height (die mit der
  // Drehung wachsende Auffuell-Bounding-Box).
  let naturalWidth = 0
  let naturalHeight = 0
  let rotationDegrees = 0
  let zoomPercent = 100
  let strokeColor = DEFAULT_STROKE_COLOR
  let lineWidthPx = 3
  let points: TracePoint[] = []
  let closed = false
  let closingControl: Point | undefined
  let dragAnchor: Point | null = null
  let dragCurrent: Point | null = null
  let dragging = false
  let activePointerId: number | null = null
  let pointEditMode: PointEditMode = 'move'
  let draggingPointIndex: number | null = null
  // Foto-Verschieben (Scrollen) im 'move'-Modus, wenn der Zeiger NICHT auf
  // einem bestehenden Punkt liegt - siehe pointerdown/-move/-up unten.
  // Bewusst in CSS-Pixeln/Bildschirmkoordinaten (event.clientX/Y), nicht in
  // toNatural()-Fotokoordinaten: scrollLeft/Top von canvasWrap sind ebenfalls
  // CSS-Pixel, eine direkte Differenz der Client-Koordinaten passt hier ohne
  // weitere Umrechnung.
  let panning = false
  let panStartClientX = 0
  let panStartClientY = 0
  let panStartScrollLeft = 0
  let panStartScrollTop = 0
  // Startwert 'bezier' bewahrt das bisherige gemischte Klick/Ziehen-
  // Verhalten als Standard, solange der Nutzer nichts anderes waehlt.
  let pointType: PointType = 'bezier'

  /** Undo-Verlauf: ein Snapshot von points/closed/closingControl VOR jeder
   *  punktveraendernden Aktion (neuer Punkt, Schliessen, Verschieben,
   *  Einfuegen, Entfernen, "Alles loeschen") - siehe pushHistory(). Bewusst
   *  NICHT nur "den letzten Schritt speziell behandeln" (wie zuvor bei
   *  geschlossenem Pfad): so laesst sich beliebig oft hintereinander
   *  rueckgaengig machen, auch fuer Punkt-Bearbeitungen NACH dem Schliessen. */
  interface Snapshot {
    points: TracePoint[]
    closed: boolean
    closingControl?: Point
  }
  let history: Snapshot[] = []

  function pushHistory(): void {
    history.push({
      points: structuredClone(points),
      closed,
      closingControl: closingControl ? structuredClone(closingControl) : undefined,
    })
  }

  // Auslagern in ein eigenes Fenster (siehe popOut()/bringBack() unten) -
  // bewusst NICHT Teil von resetSession(): betrifft die Fenster-/Dialog-
  // Lebensdauer, nicht die Zeichen-Sitzung selbst.
  let popupWindow: Window | null = null
  // Verhindert, dass der naechste dialog.close() (ausgeloest von popOut()
  // beim Auslagern ODER von finishDialog() nach bereits erledigtem Commit)
  // den 'close'-Listener nochmal ein zweites Mal committen/zuruecksetzen
  // laesst - siehe finishDialog()/popOut()/bringBack().
  let suppressNextClose = false

  function toNatural(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function cssScale(): number {
    return canvas.width / canvas.getBoundingClientRect().width
  }

  function updateButtons(): void {
    undoBtn.disabled = history.length === 0
    clearBtn.disabled = points.length === 0 && !closed
    doneBtn.disabled = !closed
    zoomInBtn.disabled = zoomPercent >= ZOOM_MAX_PERCENT
    zoomOutBtn.disabled = zoomPercent <= ZOOM_MIN_PERCENT
    insertPointBtn.disabled = !closed
    movePointBtn.disabled = !closed
    deletePointBtn.disabled = !closed || points.length <= 3
  }

  /** Findet den Index des Punkts unter `pos` (innerhalb des Klick-Radius),
   *  oder -1. Genutzt sowohl im 'move'-Modus (Punkt zum Ziehen aufnehmen) als
   *  auch im 'delete'-Modus. */
  function hitTestPoint(pos: Point): number {
    const radius = CLOSE_HIT_RADIUS_CSS_PX * cssScale()
    for (let i = 0; i < points.length; i++) {
      if (distance(pos, points[i]) <= radius) return i
    }
    return -1
  }

  /** Index, an dem ein bei `pos` eingefuegter Punkt in `points` landen soll -
   *  das naechstgelegene Segment (inkl. des schliessenden Segments
   *  letzter-Punkt->points[0]) bestimmt die Position. */
  function nearestSegmentInsertIndex(pos: Point): number {
    let bestIndex = points.length
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = i === points.length - 1 ? points[0] : points[i + 1]
      const d = distanceToSegment(pos, a, b)
      if (d < bestDist) {
        bestDist = d
        bestIndex = i + 1
      }
    }
    return bestIndex
  }

  function applyPointEditMode(): void {
    insertPointBtn.setAttribute('aria-pressed', String(pointEditMode === 'insert'))
    movePointBtn.setAttribute('aria-pressed', String(pointEditMode === 'move'))
    deletePointBtn.setAttribute('aria-pressed', String(pointEditMode === 'delete'))
    // Vor dem Schliessen bleibt der Zeichen-Cursor (crosshair) unabhaengig
    // von pointEditMode (der Wert ist dann irrelevant/immer 'move') aktiv -
    // 'draw' hat bewusst keine eigene CSS-Regel.
    canvas.dataset.editMode = closed ? pointEditMode : 'draw'
  }

  function togglePointEditMode(mode: 'insert' | 'delete'): void {
    pointEditMode = pointEditMode === mode ? 'move' : mode
    applyPointEditMode()
  }

  /** Aktualisiert die gedrueckt/nicht-gedrueckt-Optik der drei Segmenttyp-
   *  Knoepfe (Linie/Bezier/B-Spline) - anders als Einfuegen/Loeschen KEIN
   *  Umschalter, sondern eine Radiogruppe: genau einer der drei ist immer
   *  aktiv. */
  function applyPointType(): void {
    pointTypeLineBtn.setAttribute('aria-pressed', String(pointType === 'line'))
    pointTypeBezierBtn.setAttribute('aria-pressed', String(pointType === 'bezier'))
    pointTypeBsplineBtn.setAttribute('aria-pressed', String(pointType === 'bspline'))
  }

  /** Zeichnet NUR die Fotoebene (weiss aufgefuellte Drehung, keine Pfad-/
   *  Punkt-Ueberlagerung) - genutzt sowohl fuer die sichtbare Vorschau
   *  (redraw()) als auch beim "Fertig"-Export (bakePhoto()), damit beide
   *  garantiert exakt dasselbe Bild zeigen/speichern. */
  function drawPhotoLayer(
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    targetCtx.fillStyle = '#ffffff'
    targetCtx.fillRect(0, 0, width, height)
    targetCtx.save()
    targetCtx.translate(width / 2, height / 2)
    targetCtx.rotate((rotationDegrees * Math.PI) / 180)
    targetCtx.drawImage(
      photoImage,
      -naturalWidth / 2,
      -naturalHeight / 2,
      naturalWidth,
      naturalHeight,
    )
    targetCtx.restore()
  }

  function redraw(): void {
    drawPhotoLayer(ctx, canvas.width, canvas.height)

    // lineWidthPx ist ein direkter Pixelwert im natuerlichen Canvas-
    // Koordinatenraum (siehe trace-line-width-*-btn) - kein automatisch
    // skalierender Faktor mehr, sondern eine konkrete, vom Nutzer gewaehlte
    // Strichstaerke in px (der Startwert wird einmalig beim Laden des Fotos
    // aus dessen Aufloesung hergeleitet, siehe loadPhotoInto()).
    const effectiveLineWidth = lineWidthPx

    const d = tracePathData(points, closed, closingControl)
    if (d) {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = effectiveLineWidth
      ctx.stroke(new Path2D(d))
    }

    if (dragging && dragAnchor && dragCurrent && points.length > 0) {
      const last = points[points.length - 1]
      ctx.strokeStyle = `${strokeColor}aa`
      ctx.lineWidth = effectiveLineWidth
      ctx.setLineDash([4, 4])
      // Kurven-Vorschau (mit Zug-Kontrollpunkt) nur im 'bezier'-Modus - in
      // 'line'/'bspline' wird eine Zeigerbewegung fuer die Kurvenform ja
      // ohnehin ignoriert (siehe pointerup-Handler), die Vorschau zeigt dann
      // konsequent nur die gerade Verbindungslinie zum Ankerpunkt.
      const previewPath =
        pointType === 'bezier'
          ? `M ${last.x} ${last.y} Q ${dragCurrent.x} ${dragCurrent.y} ${dragAnchor.x} ${dragAnchor.y}`
          : `M ${last.x} ${last.y} L ${dragAnchor.x} ${dragAnchor.y}`
      ctx.stroke(new Path2D(previewPath))
      ctx.setLineDash([])
    }

    const anchorRadius = Math.max(3, canvas.width / 200)
    points.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, anchorRadius, 0, Math.PI * 2)
      ctx.fillStyle = strokeColor
      ctx.fill()
      if (i === 0 && points.length >= 3 && !closed) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, anchorRadius * 2.2, 0, Math.PI * 2)
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = 2
        ctx.stroke()
      }
    })

    updateButtons()
  }

  /** Berechnet, wie hoch canvasWrap tatsaechlich sein darf, ohne dass Kopf-
   *  zeile/Hinweistext/Toolbar/Fusszeile aus dem Dialog (bzw. dem Popup-
   *  Fenster, siehe popOut()) herausragen - eine feste vh-Zahl allein reicht
   *  nicht, weil die Toolbar je nach Fensterbreite ein- oder zweizeilig
   *  umbricht und der native <dialog> selbst schon eine eigene max-height
   *  mitbringt. Kurz das eigene max-height entfernen, um die NATUERLICHE
   *  Gesamthoehe zu messen (contentWrapper.scrollHeight) und daraus den
   *  Anteil ohne canvasWrap zu ermitteln - das ist unabhaengig vom Foto
   *  (Rotation/Zoom aendern nur den Inhalt INNERHALB von canvasWrap, nicht
   *  den Platzbedarf der anderen Elemente) und muss daher nur bei
   *  Fenstergroessenaenderungen bzw. beim Oeffnen/Aus-/Einlagern neu
   *  berechnet werden, nicht bei jedem redraw(). */
  // Sicherheitsabstand gegen Rundungsfehler bei der Messung (Sub-Pixel-
  // Layoutwerte, Rahmen/Scrollbar-Breiten) - ohne ihn lag die berechnete
  // Hoehe teils hauchduenn (< 1px) UEBER dem tatsaechlich verfuegbaren Platz,
  // was den Dialog knapp ueber den sichtbaren Bereich hinausragen liess und
  // einen eigenen Scrollbalken ausloeste.
  const HEIGHT_SAFETY_MARGIN_PX = 8

  function updateCanvasWrapMaxHeight(): void {
    const container = contentWrapper.parentElement
    if (!container) return
    canvasWrap.style.maxHeight = 'none'
    const nonWrapHeight = contentWrapper.scrollHeight - canvasWrap.offsetHeight
    // container.clientHeight umfasst das EIGENE Padding des Containers
    // (Inhalt+Padding-Box) - im eingebetteten <dialog> (siehe .info-dialog)
    // UND im Popup-Fenster-<body> (siehe moveContentIn()) ist das ungleich
    // null. Ohne diesen Abzug wurde der berechnete verfuegbare Platz um
    // genau das Padding zu grosszuegig geschaetzt, was im Popup-Fenster
    // (dessen body.clientHeight IMMER exakt der Fensterhoehe entspricht,
    // unabhaengig vom Inhalt - anders als beim <dialog>, das nur bei
    // tatsaechlich ueberlaufendem Inhalt an seine max-height stoesst) zu
    // einem eigenen Scrollbalken fuehrte.
    const containerStyle = getComputedStyle(container)
    const containerPadding =
      Number.parseFloat(containerStyle.paddingTop) + Number.parseFloat(containerStyle.paddingBottom)
    const available =
      container.clientHeight - containerPadding - nonWrapHeight - HEIGHT_SAFETY_MARGIN_PX
    canvasWrap.style.maxHeight = `${Math.max(200, available)}px`
  }
  window.addEventListener('resize', () => {
    if (dialog.open || popupWindow) updateCanvasWrapMaxHeight()
  })

  function updateZoomDisplay(): void {
    canvas.style.width = `${zoomPercent}%`
    zoomLabel.textContent = `${zoomPercent}%`
    updateButtons()
  }

  function updateLineWidthDisplay(): void {
    lineWidthLabel.textContent = `${lineWidthPx}px`
    lineWidthInBtn.disabled = lineWidthPx >= LINE_WIDTH_MAX_PX
    lineWidthOutBtn.disabled = lineWidthPx <= LINE_WIDTH_MIN_PX
  }

  function resetSession(): void {
    currentBlock = null
    naturalWidth = 0
    naturalHeight = 0
    rotationDegrees = 0
    zoomPercent = 100
    strokeColor = DEFAULT_STROKE_COLOR
    // Vorlaeufiger Platzhalter, bis loadPhotoInto() die tatsaechliche
    // Fotoaufloesung kennt und einen passenden Startwert setzt.
    lineWidthPx = 3
    colorInput.value = DEFAULT_STROKE_COLOR
    points = []
    closed = false
    closingControl = undefined
    dragAnchor = null
    dragCurrent = null
    dragging = false
    activePointerId = null
    pointEditMode = 'move'
    draggingPointIndex = null
    panning = false
    delete canvas.dataset.panning
    pointType = 'bezier'
    history = []
    applyPointEditMode()
    applyPointType()
  }

  canvas.addEventListener('pointerdown', (event) => {
    const pos = toNatural(event)

    if (closed) {
      if (pointEditMode === 'delete') {
        const idx = hitTestPoint(pos)
        if (idx !== -1 && points.length > 3) {
          pushHistory()
          if (idx === 0) closingControl = undefined
          points.splice(idx, 1)
          redraw()
        }
        return
      }
      if (pointEditMode === 'insert') {
        pushHistory()
        const newPoint: TracePoint =
          pointType === 'bspline' ? { x: pos.x, y: pos.y, smooth: true } : { x: pos.x, y: pos.y }
        points.splice(nearestSegmentInsertIndex(pos), 0, newPoint)
        redraw()
        return
      }
      // 'move': ein bestehender Punkt wird nur aufgenommen, wenn der Zeiger
      // tatsaechlich darauf liegt - ein Klick+Ziehen daneben verschiebt
      // stattdessen das Foto (Scrollen von canvasWrap), analog zum
      // "Hand"-Werkzeug in Bildbearbeitungsprogrammen. Ein Snapshot HIER
      // (statt bei jedem pointermove) macht undo pro abgeschlossenem
      // Ziehvorgang rueckgaengig, nicht pro Pixel.
      const idx = hitTestPoint(pos)
      if (idx === -1) {
        panning = true
        canvas.setPointerCapture(event.pointerId)
        activePointerId = event.pointerId
        panStartClientX = event.clientX
        panStartClientY = event.clientY
        panStartScrollLeft = canvasWrap.scrollLeft
        panStartScrollTop = canvasWrap.scrollTop
        canvas.dataset.panning = 'true'
        return
      }
      pushHistory()
      updateButtons()
      canvas.setPointerCapture(event.pointerId)
      activePointerId = event.pointerId
      draggingPointIndex = idx
      return
    }

    canvas.setPointerCapture(event.pointerId)
    activePointerId = event.pointerId
    dragAnchor = pos
    dragCurrent = pos
    dragging = false
  })

  canvas.addEventListener('pointermove', (event) => {
    if (activePointerId !== event.pointerId) return

    if (panning) {
      canvasWrap.scrollLeft = panStartScrollLeft - (event.clientX - panStartClientX)
      canvasWrap.scrollTop = panStartScrollTop - (event.clientY - panStartClientY)
      return
    }

    const pos = toNatural(event)

    if (draggingPointIndex !== null) {
      points[draggingPointIndex] = { ...points[draggingPointIndex], x: pos.x, y: pos.y }
      redraw()
      return
    }

    if (!dragAnchor) return
    if (!dragging && distance(pos, dragAnchor) > DRAG_THRESHOLD_CSS_PX * cssScale()) {
      dragging = true
    }
    dragCurrent = pos
    redraw()
  })

  canvas.addEventListener('pointerup', (event) => {
    if (activePointerId !== event.pointerId) return

    if (panning) {
      panning = false
      activePointerId = null
      delete canvas.dataset.panning
      return
    }

    if (draggingPointIndex !== null) {
      draggingPointIndex = null
      activePointerId = null
      redraw()
      return
    }

    if (!dragAnchor) return
    const endPos = toNatural(event)
    pushHistory()

    // Ziehen erzeugt eine manuelle Bezierkurve NUR im 'bezier'-Modus - in
    // 'line'/'bspline' wird eine evtl. Zeigerbewegung fuer die Kurvenform
    // ignoriert (im 'bspline'-Modus wird die Kurve ohnehin automatisch aus
    // den Nachbarpunkten berechnet, siehe TracePoint.smooth).
    const makesCurve = dragging && pointType === 'bezier'
    if (
      points.length >= 3 &&
      distance(dragAnchor, points[0]) <= CLOSE_HIT_RADIUS_CSS_PX * cssScale()
    ) {
      closed = true
      closingControl = makesCurve ? endPos : undefined
      applyPointEditMode()
    } else if (pointType === 'bspline') {
      points.push({ x: dragAnchor.x, y: dragAnchor.y, smooth: true })
    } else {
      points.push(
        makesCurve
          ? { x: dragAnchor.x, y: dragAnchor.y, control: endPos }
          : { x: dragAnchor.x, y: dragAnchor.y },
      )
    }

    dragAnchor = null
    dragCurrent = null
    dragging = false
    activePointerId = null
    redraw()
  })

  undoBtn.addEventListener('click', () => {
    const previous = history.pop()
    if (!previous) return
    points = previous.points
    closed = previous.closed
    closingControl = previous.closingControl
    pointEditMode = 'move'
    applyPointEditMode()
    redraw()
  })

  clearBtn.addEventListener('click', () => {
    if (points.length === 0 && !closed) return
    pushHistory()
    points = []
    closed = false
    closingControl = undefined
    pointEditMode = 'move'
    applyPointEditMode()
    redraw()
  })

  colorInput.addEventListener('input', () => {
    strokeColor = colorInput.value
    redraw()
  })

  // Ein natives <input type="color"> hat keine "Palette schliessen"-API -
  // ein Klick auf das Farbfeld OEFFNET die Palette immer erneut, selbst wenn
  // sie schon offen ist. Damit ein zweiter Klick auf dasselbe Farbfeld die
  // Palette stattdessen wieder SCHLIESST: 'focus' (feuert, sobald der
  // Browser die Palette oeffnet) und 'blur' (feuert, sobald sie schliesst)
  // verfolgen die Palette bereits offen ist, den 'mousedown' abfangen (bevor
  // der Browser die Palette (erneut) oeffnen wuerde) und stattdessen per
  // blur() aktiv schliessen.
  let colorPickerOpen = false
  colorInput.addEventListener('focus', () => {
    colorPickerOpen = true
  })
  colorInput.addEventListener('blur', () => {
    colorPickerOpen = false
  })
  colorInput.addEventListener('mousedown', (event) => {
    if (colorPickerOpen) {
      event.preventDefault()
      colorInput.blur()
    }
  })
  lineWidthInBtn.addEventListener('click', () => {
    lineWidthPx = Math.min(LINE_WIDTH_MAX_PX, lineWidthPx + LINE_WIDTH_STEP_PX)
    updateLineWidthDisplay()
    redraw()
  })
  lineWidthOutBtn.addEventListener('click', () => {
    lineWidthPx = Math.max(LINE_WIDTH_MIN_PX, lineWidthPx - LINE_WIDTH_STEP_PX)
    updateLineWidthDisplay()
    redraw()
  })

  insertPointBtn.addEventListener('click', () => togglePointEditMode('insert'))
  movePointBtn.addEventListener('click', () => {
    pointEditMode = 'move'
    applyPointEditMode()
  })
  deletePointBtn.addEventListener('click', () => togglePointEditMode('delete'))

  function setPointType(type: PointType): void {
    pointType = type
    applyPointType()
  }
  pointTypeLineBtn.addEventListener('click', () => setPointType('line'))
  pointTypeBezierBtn.addEventListener('click', () => setPointType('bezier'))
  pointTypeBsplineBtn.addEventListener('click', () => setPointType('bspline'))

  function applyRotation(deltaDegrees: number): void {
    const oldCenter: Point = { x: canvas.width / 2, y: canvas.height / 2 }
    rotationDegrees = (rotationDegrees + deltaDegrees + 360) % 360
    const bbox = rotatedBoundingBox(naturalWidth, naturalHeight, rotationDegrees)
    const newCenter: Point = { x: bbox.x / 2, y: bbox.y / 2 }

    const transform = (p: Point): Point => rotateAround(p, oldCenter, newCenter, deltaDegrees)
    points = points.map((p) => ({
      ...transform(p),
      control: p.control ? transform(p.control) : undefined,
      // smooth-Punkte haben keinen gespeicherten Kontrollpunkt zum
      // Mittransformieren (der wird ja live aus den - hier bereits
      // transformierten - Nachbarpositionen berechnet) - das Flag selbst
      // muss aber erhalten bleiben, sonst wuerde Drehen die B-Spline-
      // Eigenschaft eines Punktes stillschweigend loeschen.
      smooth: p.smooth,
    }))
    if (closingControl) closingControl = transform(closingControl)

    canvas.width = bbox.x
    canvas.height = bbox.y
    redraw()
  }
  rotateLeftBtn.addEventListener('click', () => applyRotation(-ROTATE_STEP_DEGREES))
  rotateRightBtn.addEventListener('click', () => applyRotation(ROTATE_STEP_DEGREES))

  zoomInBtn.addEventListener('click', () => {
    zoomPercent = Math.min(ZOOM_MAX_PERCENT, zoomPercent + ZOOM_STEP_PERCENT)
    updateZoomDisplay()
  })
  zoomOutBtn.addEventListener('click', () => {
    zoomPercent = Math.max(ZOOM_MIN_PERCENT, zoomPercent - ZOOM_STEP_PERCENT)
    updateZoomDisplay()
  })

  function loadPhotoInto(dataUrl: string, width: number, height: number): Promise<void> {
    naturalWidth = width
    naturalHeight = height
    canvas.width = width
    canvas.height = height
    // Startwert der Linienstaerke von der tatsaechlichen Fotoaufloesung
    // ableiten (wie zuvor die automatische Skalierung) - ab hier aber ein
    // einfacher, vom Nutzer frei per +/- veraenderbarer Pixelwert, keine
    // automatische Neuberechnung mehr bei jedem redraw().
    lineWidthPx = Math.max(LINE_WIDTH_MIN_PX, Math.round(width / 300))
    updateLineWidthDisplay()
    return new Promise((resolve, reject) => {
      photoImage = new Image()
      photoImage.onload = () => resolve()
      photoImage.onerror = () => reject(new Error('Foto konnte nicht geladen werden'))
      photoImage.src = dataUrl
    })
  }

  /** Exportiert die aktuelle (gedrehte, weiss aufgefuellte) Fotoebene als
   *  frische JPEG-data:-URL - OHNE die Pfad-/Punkt-Ueberlagerung, die nur
   *  auf dem sichtbaren `canvas` mitgezeichnet wird. Wird beim "Fertig"-
   *  Commit als neuer state.photoDataUrl gespeichert, damit ein spaeteres
   *  Nachbearbeiten wieder bei Drehung=0 mit genau diesem (schon gedrehten)
   *  Bild als neuer Ausgangspunkt beginnt. */
  function bakePhoto(): string {
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const exportCtx = exportCanvas.getContext('2d')!
    drawPhotoLayer(exportCtx, exportCanvas.width, exportCanvas.height)
    return exportCanvas.toDataURL('image/jpeg', EXPORT_JPEG_QUALITY)
  }

  /** Uebernimmt (bei 'done' mit geschlossenem Pfad) das Ergebnis in den
   *  Block/Workspace und raeumt die Sitzung auf - unabhaengig davon, ob der
   *  Dialog gerade im Hauptfenster oder ausgelagert in einem eigenen Fenster
   *  sitzt (siehe popOut()): `canvas`/`points` etc. sind reine
   *  Objektreferenzen bzw. Closures, die nicht davon abhaengen, in welchem
   *  Dokument der Canvas gerade haengt. */
  function commitAndReset(result: 'cancel' | 'done'): void {
    if (result === 'done' && closed) {
      const state: TracePhotoState = {
        photoDataUrl: bakePhoto(),
        width: canvas.width,
        height: canvas.height,
        points,
        closed: true,
        closingControl,
      }
      if (currentBlock) {
        const block = currentBlock
        // loadExtraState() allein loest KEIN Change-Event aus - Re-Render
        // (viewerPanel.ts/codePanel.ts) und Autosave (workspace.ts) haengen
        // aber ueberall an workspace.addChangeListener/!isUiEvent. Ohne dieses
        // manuelle Event wuerde eine Nachbearbeitung also weder neu rendern
        // noch gespeichert werden.
        const oldStateJson = JSON.stringify(block.saveExtraState?.())
        block.loadExtraState?.(state)
        block.render()
        const newStateJson = JSON.stringify(block.saveExtraState?.())
        Blockly.Events.fire(
          new Blockly.Events.BlockChange(block, 'mutation', null, oldStateJson, newStateJson),
        )
      } else {
        const block = workspace.newBlock('os_trace_photo')
        block.loadExtraState?.(state)
        block.initSvg()
        block.render()
        placeNewBlock(workspace, block)
      }
    }
    resetSession()
  }

  // Faengt Escape/Backdrop-Klick ab (kein expliziter Button-Klick, daher noch
  // kein commitAndReset() gelaufen) - `dialog.returnValue` bleibt in diesem
  // Fall der Leerstring aus openForNew()/openForEdit(), zaehlt also als
  // 'cancel'. Bei explizitem Button-Klick (finishDialog() unten) UND beim
  // Auslagern (popOut() unten) ist suppressNextClose gesetzt, da dort
  // entweder schon committed wurde oder gar nicht committed werden soll.
  dialog.addEventListener('close', () => {
    if (suppressNextClose) {
      suppressNextClose = false
      return
    }
    commitAndReset(dialog.returnValue === 'done' ? 'done' : 'cancel')
  })

  /** Schliesst die Sitzung ueber einen expliziten Button-Klick (Abbrechen/
   *  Fertig) ab - unabhaengig davon, ob der Dialog gerade ausgelagert ist:
   *  ist er es, wird ZUERST das Popup-Fenster geschlossen (das bringt den
   *  Inhalt per bringBack() automatisch zurueck ins Hauptfenster-<dialog>,
   *  OHNE es erneut zu oeffnen - suppressNextClose sorgt dafuer). */
  function finishDialog(result: 'cancel' | 'done'): void {
    commitAndReset(result)
    suppressNextClose = true
    if (popupWindow) popupWindow.close()
    else dialog.close()
  }
  cancelBtn.addEventListener('click', () => finishDialog('cancel'))
  doneBtn.addEventListener('click', () => finishDialog('done'))

  function updatePopoutUi(open: boolean): void {
    popoutBtn.innerHTML = open ? EMBED_ICON_SVG : POPOUT_ICON_SVG
    const label = open ? t('trace_photo.popout_close') : t('trace_photo.popout_open')
    popoutBtn.title = label
    popoutBtn.setAttribute('aria-label', label)
    popoutBtn.setAttribute('aria-pressed', String(open))
  }

  /** Holt den Inhalt zurueck ins Hauptfenster-<dialog>, wenn das Popup-
   *  Fenster geschlossen wird - EGAL ob durch finishDialog() (Fertig/
   *  Abbrechen im Popup geklickt, commitAndReset() ist dann schon gelaufen,
   *  suppressNextClose verhindert ein erneutes Oeffnen) oder weil der Nutzer
   *  das Popup-Fenster einfach selbst (per Fenster-X) geschlossen hat (dann
   *  geht die Sitzung im wieder modal geoeffneten Hauptfenster-Dialog normal
   *  weiter, ohne etwas zu verwerfen). */
  function bringBack(): void {
    popupWindow = null
    dialog.appendChild(contentWrapper)
    updatePopoutUi(false)
    // Der Canvas-Bildinhalt (Foto + Pfad-/Punkt-Ueberlagerung) kann beim
    // Verschieben eines <canvas>-Elements ueber eine Dokumentgrenze hinweg
    // (appendChild in ein ANDERES document, wie hier zwischen Haupt- und
    // Popup-Fenster) verlorengehen - anders als innerhalb desselben
    // Dokuments wird die Bitmap dabei nicht zuverlaessig erhalten. Ohne
    // dieses explizite redraw() blieb der Canvas dann schwarz, bis
    // irgendeine andere Aktion (z.B. Drehen, das canvas.width neu setzt und
    // dabei redraw() ausloest) zufaellig ein Neuzeichnen anstiess.
    redraw()
    if (suppressNextClose) {
      suppressNextClose = false
      return
    }
    dialog.showModal()
    updateCanvasWrapMaxHeight()
  }

  /** Verschiebt den gesamten Dialog-Inhalt (Titel/Werkzeugleiste/Canvas/
   *  Footer-Buttons) in ein eigenes Browser-Fenster - exaktes Vorbild:
   *  popout.ts::makePopout() (dort fuer das dauerhaft eingebettete Viewer-
   *  Panel, hier fuer einen modalen <dialog>). Anders als dort muss der
   *  Haupt-<dialog> dabei aber selbst GESCHLOSSEN werden (ein natives
   *  <dialog> kann nicht "leer" modal offen bleiben, ohne wie ein Rendering-
   *  Fehler auszusehen) - suppressNextClose verhindert, dass dieses
   *  Schliessen faelschlich als Abbrechen gewertet wird. Zeichen-Zustand
   *  (points/canvas/photoImage etc.) bleibt unberuehrt, da all das reine
   *  JS-Objektreferenzen/Closures sind, die nicht davon abhaengen, in
   *  welchem Dokument der `canvas` gerade als Kind haengt. */
  function popOut(): void {
    // Deutlich groesser als der eingebettete Dialog (siehe .trace-photo-dialog
    // in layout.css, dort bewusst auf max. 60rem begrenzt) - das Auslagern in
    // ein eigenes Fenster ist gerade der Weg zu einem GROESSEREN
    // Arbeitsbereich, ohne den eingebetteten Dialog selbst ueberdimensioniert
    // wirken zu lassen.
    const opened = window.open(
      `${import.meta.env.BASE_URL}viewer.html`,
      'blockscad-trace-photo-popout',
      'width=1400,height=900',
    )
    if (!opened) return // Popup-Blocker o.ae. - Dialog bleibt einfach eingebettet.
    const win = opened
    popupWindow = win
    // window.addEventListener('resize', ...) weiter unten in dieser Funktion
    // (siehe updateCanvasWrapMaxHeight()) haengt am HAUPTfenster - ein
    // eigener Listener hier ist noetig, damit ein Groessenaendern DES
    // POPUP-Fensters selbst (eigenes Fenster/eigenes 'window'-Objekt, siehe
    // moveContentIn() unten) den verfuegbaren Platz ebenfalls neu misst,
    // statt dauerhaft bei der Groesse zum Zeitpunkt des Auslagerns zu bleiben.
    win.addEventListener('resize', () => {
      if (popupWindow) updateCanvasWrapMaxHeight()
    })
    // window.open(url) navigiert intern erst vom anfaenglichen Platzhalter-
    // Dokument zu viewer.html - dieser Navigationswechsel loest bereits ein
    // EIGENES 'pagehide' aus (fuer das Platzhalter-Dokument), lange BEVOR
    // 'load' fuer viewer.html feuert. Ohne diese Flag wuerde bringBack() auf
    // dieses verfruehte 'pagehide' reagieren und popupWindow faelschlich
    // wieder auf null setzen, obwohl der Inhalt noch gar nicht umgezogen ist.
    let contentMoved = false

    function moveContentIn(): void {
      const theme = document.documentElement.dataset.theme
      if (theme) win.document.documentElement.dataset.theme = theme
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        win.document.head.appendChild(node.cloneNode(true))
      })
      win.document.body.style.margin = '0'
      win.document.body.style.padding = '1rem'
      // --color-surface (weiss im Hellmodus) statt --color-bg: genau das
      // nutzt auch der eingebettete Dialog selbst als Hintergrund (siehe
      // .info-dialog) - beim Auslagern soll sich daran optisch nichts
      // aendern, --color-bg (das allgemeine, etwas graue Seiten-Hintergrund)
      // wirkte hier wie ein Bruch gegenueber dem gewohnten Dialog-Look.
      win.document.body.style.background = 'var(--color-surface)'
      win.document.body.appendChild(contentWrapper)
      contentMoved = true
      suppressNextClose = true
      dialog.close()
      updatePopoutUi(true)
      // Siehe bringBack() fuer die Begruendung: der Canvas-Bildinhalt
      // ueberlebt den Dokumentwechsel nicht zuverlaessig, daher hier explizit
      // neu zeichnen statt uns auf die zuvor schon vorhandene Bitmap zu
      // verlassen.
      redraw()
      // Der verfuegbare Platz aendert sich beim Auslagern (Popup-Fenster
      // 900x760 statt des Haupt-<dialog>) - neu berechnen statt die im
      // Hauptfenster ermittelte Hoehe einfach weiterzuverwenden.
      updateCanvasWrapMaxHeight()
    }
    // Siehe makePopout() fuer die ausfuehrliche Begruendung: erst auf 'load'
    // warten, sonst landet moveContentIn() noch im fluechtigen Platzhalter-
    // Dokument statt in viewer.html.
    win.addEventListener('load', moveContentIn, { once: true })
    win.addEventListener('pagehide', () => {
      if (!contentMoved) return
      bringBack()
    })
  }

  popoutBtn.addEventListener('click', () => {
    if (popupWindow) popupWindow.close()
    else popOut()
  })
  window.addEventListener('beforeunload', () => popupWindow?.close())

  return {
    openForNew(photo: NewPhoto): void {
      resetSession()
      updateZoomDisplay()
      void loadPhotoInto(photo.photoDataUrl, photo.width, photo.height).then(redraw)
      dialog.returnValue = ''
      dialog.showModal()
      updateCanvasWrapMaxHeight()
    },
    openForEdit(block: BlockSvg, state: TracePhotoState): void {
      resetSession()
      updateZoomDisplay()
      currentBlock = block
      // Tiefkopie: "Abbrechen" darf den Original-Blockzustand nie veraendert
      // haben, selbst wenn waehrend des Bearbeitens schon Punkte
      // hinzugefuegt/entfernt wurden.
      points = structuredClone(state.points)
      closed = state.closed
      closingControl = state.closingControl ? structuredClone(state.closingControl) : undefined
      void loadPhotoInto(state.photoDataUrl, state.width, state.height).then(redraw)
      dialog.returnValue = ''
      dialog.showModal()
      updateCanvasWrapMaxHeight()
    },
  }
}
