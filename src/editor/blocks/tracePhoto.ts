import * as Blockly from 'blockly'
import type { BlockDefinition } from './types'
import { PRIMITIVE_2D_COLOUR } from './colours'
import { STATEMENT_TYPE } from './constants'
import { centeredOptions, registerNumberShadows } from './blockHelpers'
import { t } from '../../i18n'

const STATE_EXTENSION = 'os_trace_photo_state'

// 1x1 transparentes PNG - Platzhalter fuer das Vorschaubild, bevor
// loadExtraState() das echte Foto eingesetzt hat. Wie bei os_import_svg/
// os_import_stl kommt dieser Block NIE ueber die Toolbox-Flyout in den
// Workspace (ein dort herausgezogener Block haette kein Foto), sondern
// ausschliesslich ueber ui/tracePhoto.ts mit sofort vorhandenem Inhalt -
// dieser Platzhalter wird also praktisch nie sichtbar.
const BLANK_THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

/** Ein Kurvenpunkt (Ankerpunkt einer Klick- oder Klick-Zieh-Aktion). Das
 *  Segment vom VORHERIGEN Punkt zu DIESEM ist:
 *  - eine gerade Linie, wenn weder `control` noch `smooth` gesetzt sind,
 *  - eine quadratische Bezierkurve mit manuell gezogenem Kontrollpunkt
 *    `control` (absolute Koordinaten, gleicher Raum wie width/height), wenn
 *    `control` gesetzt ist,
 *  - eine automatisch geglaettete B-Spline-artige Kurve, wenn `smooth` true
 *    ist - die tatsaechlichen (kubischen) Kontrollpunkte werden dafuer NICHT
 *    gespeichert, sondern bei jedem Pfadaufbau frisch aus den Nachbarpunkten
 *    berechnet (siehe catmullRomControlPoints()/tracePathData()), damit sie
 *    IMMER zur aktuellen Position der Nachbarn passen (auch nachdem ein
 *    Nachbarpunkt spaeter verschoben wurde). `smooth` hat Vorrang vor
 *    `control`, falls (eigentlich nie noetig) beides gesetzt waere.
 *  Fuer points[0] (Pfadanfang, "M") werden beide Felder ignoriert. */
export interface TracePoint {
  x: number
  y: number
  control?: { x: number; y: number }
  smooth?: boolean
}

export interface Vec2 {
  x: number
  y: number
}

/** Kubische Bezier-Kontrollpunkte fuer das Kurvensegment von `p1` nach `p2`
 *  einer Catmull-Rom-Kette, gegeben die beiden AEUSSEREN Nachbarn `p0`
 *  (vor p1) und `p3` (nach p2) - Standardformel zur Umrechnung Catmull-Rom
 *  -> kubische Bezier (SVG/Canvas kennen keine native B-Spline-Kurve, daher
 *  dieser Umweg ueber Bezier-Kontrollpunkte). Ergibt eine tangentenstetige
 *  ("glatte") Kurve durch alle Punkte der Kette, ohne dass der Nutzer pro
 *  Segment einen Kontrollpunkt ziehen muss - siehe TracePoint.smooth. */
export function catmullRomControlPoints(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
): { c1: Vec2; c2: Vec2 } {
  return {
    c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  }
}

/** Liefert den Nachbarpunkt bei `index` fuer die Catmull-Rom-Berechnung:
 *  bei geschlossenem Pfad wird um die Punkteliste herumgegriffen (der Pfad
 *  ist ja ein Kreis aus Segmenten), bei offenem Pfad wird der jeweils
 *  fehlende AEUSSERE Nachbar durch den naeheren vorhandenen Endpunkt ersetzt
 *  (uebliche "geklemmte" Randbedingung fuer eine offene Punktkette - ergibt
 *  am Anfang/Ende einen plausiblen einseitigen Tangenten-Schaetzwert statt
 *  eines Fehlers). */
export function catmullRomNeighbor(points: TracePoint[], index: number, closed: boolean): Vec2 {
  const n = points.length
  if (closed) return points[((index % n) + n) % n]
  if (index < 0) return points[0]
  if (index >= n) return points[n - 1]
  return points[index]
}

/** Kompletter editierbarer Zustand eines nachgezeichneten Fotos - wird als
 *  Block-extraState transportiert (gleiches saveExtraState/loadExtraState-
 *  Muster wie os_import_svg/os_import_stl in svg.ts/stl.ts), damit Speichern/
 *  Laden/Projekt-Import automatisch mitziehen. Anders als os_import_svg wird
 *  hier NICHT nur der fertige SVG-Pfad gespeichert, sondern die editierbaren
 *  Rohdaten (Foto + Punkte) - nur so kann ui/tracePhotoDialog.ts die Kontur
 *  spaeter am selben Bild nachbearbeiten, statt nur den eingefrorenen Umriss
 *  zu kennen. */
export interface TracePhotoState {
  /** Downscaled/re-encodiertes Foto als data:-URL (siehe ui/photoDownscale.ts) -
   *  legt zugleich den Koordinatenraum von width/height/points fest. */
  photoDataUrl: string
  width: number
  height: number
  points: TracePoint[]
  closed: boolean
  /** Kontrollpunkt des SCHLIESSENDEN Segments (letzter Punkt -> points[0]).
   *  Nur relevant wenn closed=true; fehlt er, ist die Schlusslinie gerade. */
  closingControl?: { x: number; y: number }
}

/** Einzige Quelle der Wahrheit fuer "Punkte -> SVG-Pfad-d-String" - wird
 *  identisch von der Live-Vorschau im Dialog (ueber `new Path2D(d)`) UND von
 *  codegen/svgAssets.ts genutzt, damit beide niemals auseinanderlaufen
 *  koennen (derselbe String, dieselbe Grammatik). Ein Segment wird als
 *  "C x1 y1 x2 y2 x y" (kubische Bezierkurve mit automatisch berechneten
 *  Catmull-Rom-Kontrollpunkten) gebaut, wenn der ZIELPUNKT `smooth: true`
 *  traegt - unabhaengig davon, ob der VORHERIGE Punkt selbst smooth war
 *  (dieselbe "der Zielpunkt bestimmt den Segmenttyp"-Konvention wie bei
 *  `control` fuer die manuelle Bezierkurve). */
export function tracePathData(
  points: TracePoint[],
  closed: boolean,
  closingControl?: { x: number; y: number },
): string {
  if (points.length === 0) return ''
  const n = points.length
  const neighbor = (index: number): Vec2 => catmullRomNeighbor(points, index, closed)

  const segments = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 1; i < n; i++) {
    const prev = points[i - 1]
    const p = points[i]
    if (p.smooth) {
      const { c1, c2 } = catmullRomControlPoints(neighbor(i - 2), prev, p, neighbor(i + 1))
      segments.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`)
    } else {
      segments.push(p.control ? `Q ${p.control.x} ${p.control.y} ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)
    }
  }
  if (closed) {
    const first = points[0]
    if (first.smooth) {
      const { c1, c2 } = catmullRomControlPoints(neighbor(n - 2), points[n - 1], first, neighbor(1))
      segments.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${first.x} ${first.y}`)
    } else {
      segments.push(
        closingControl
          ? `Q ${closingControl.x} ${closingControl.y} ${first.x} ${first.y}`
          : `L ${first.x} ${first.y}`,
      )
    }
    segments.push('Z')
  }
  return segments.join(' ')
}

/** Baut aus dem Punkte-Zustand ein vollstaendiges SVG-Dokument, wie es
 *  os_import_svg als rohen Dateiinhalt erwartet (siehe collectSvgAssets). */
export function tracePhotoToSvgMarkup(
  state: Pick<TracePhotoState, 'points' | 'closed' | 'closingControl' | 'width' | 'height'>,
): string {
  const d = tracePathData(state.points, state.closed, state.closingControl)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${state.width} ${state.height}"><path d="${d}" fill="#000000"/></svg>`
}

/** Spaet gebundene Bruecke zur UI-Schicht: der Block selbst bleibt DOM-frei
 *  (dieselbe Trennung wie ueberall sonst in editor/blocks/*), ui/tracePhoto.ts
 *  registriert beim Start EINMAL, welche Funktion den Nachzeichnen-Dialog
 *  zum Bearbeiten eines bestehenden Blocks oeffnen soll. */
let openTraceEditor: ((block: Blockly.BlockSvg, state: TracePhotoState) => void) | null = null

export function setTraceEditorOpener(
  opener: (block: Blockly.BlockSvg, state: TracePhotoState) => void,
): void {
  openTraceEditor = opener
}

const CENTER_SYNC_EXTENSION = 'os_trace_photo_center_sync'

/** viewer/photoProjectionData.ts rechnet die Millimeter-Bounding-Box der
 *  Projektion nur fuer den zentrierten Fall (CENTER='TRUE') passend zu
 *  OpenSCADs eigenem SVG-Importer um - bei "nicht zentriert" waere die
 *  Projektion gegenueber der tatsaechlichen Geometrie verschoben. Die beiden
 *  Felder werden daher synchron gehalten (gleiches Validator-Muster wie
 *  os_cylinder's LOCK->R2-Sync in primitives.ts): "auf Objekt projizieren"
 *  aktivieren zentriert automatisch mit, und "nicht zentriert" waehlen
 *  deaktiviert eine aktive Projektion automatisch wieder, statt eine dann
 *  falsch platzierte Projektion stehen zu lassen. */
function registerTracePhotoCenterSync(): void {
  if (Blockly.Extensions.isRegistered(CENTER_SYNC_EXTENSION)) return
  Blockly.Extensions.register(CENTER_SYNC_EXTENSION, function (this: Blockly.Block) {
    this.getField('PROJECT_ON_SURFACE')?.setValidator((newValue: unknown) => {
      if (newValue === 'TRUE' && this.getFieldValue('CENTER') !== 'TRUE') {
        setTimeout(() => this.setFieldValue('TRUE', 'CENTER'), 0)
      }
      return newValue
    })
    this.getField('CENTER')?.setValidator((newValue: unknown) => {
      if (newValue !== 'TRUE' && this.getFieldValue('PROJECT_ON_SURFACE') === 'TRUE') {
        setTimeout(() => this.setFieldValue('FALSE', 'PROJECT_ON_SURFACE'), 0)
      }
      return newValue
    })
  })
}

function registerTracePhotoState(): void {
  if (Blockly.Extensions.isRegistered(STATE_EXTENSION)) return
  Blockly.Extensions.register(STATE_EXTENSION, function (this: Blockly.BlockSvg) {
    let state: TracePhotoState = {
      photoDataUrl: '',
      width: 0,
      height: 0,
      points: [],
      closed: false,
    }
    this.saveExtraState = (): TracePhotoState => state
    this.loadExtraState = (newState: Partial<TracePhotoState>): void => {
      state = {
        photoDataUrl: newState.photoDataUrl ?? '',
        width: newState.width ?? 0,
        height: newState.height ?? 0,
        points: newState.points ?? [],
        closed: newState.closed ?? false,
        closingControl: newState.closingControl,
      }
      const thumb = this.getField('THUMB') as Blockly.FieldImage | null
      thumb?.setValue(state.photoDataUrl || BLANK_THUMBNAIL)
    }
    ;(this.getField('THUMB') as Blockly.FieldImage).setOnClickHandler(() => {
      openTraceEditor?.(this, state)
    })
  })
}

/** 2D-Formen: Foto nachzeichnen. Wie os_import_svg/os_import_stl NIE ueber
 *  die Toolbox-Flyout erzeugt, sondern ausschliesslich ueber den Menuepunkt
 *  "Foto nachzeichnen…" (siehe ui/tracePhoto.ts). Anders als os_import_svg
 *  traegt der Block hier die editierbaren Rohdaten (Foto + Punkte), nicht
 *  nur den fertigen SVG-Text - ein Klick auf das Vorschaubild oeffnet den
 *  Nachzeichnen-Dialog erneut zum Nachbearbeiten. */
export function tracePhotoBlocks(): BlockDefinition[] {
  registerTracePhotoState()
  registerTracePhotoCenterSync()
  registerNumberShadows('os_trace_photo_defaults', { DPI: 96 })

  return [
    {
      type: 'os_trace_photo',
      message0: t('block.trace_photo.message0'),
      args0: [
        {
          type: 'field_image',
          name: 'THUMB',
          src: BLANK_THUMBNAIL,
          width: 32,
          height: 32,
          alt: t('block.trace_photo.thumb_alt'),
        },
        { type: 'input_value', name: 'DPI', check: 'Number' },
        { type: 'field_dropdown', name: 'CENTER', options: centeredOptions() },
        { type: 'field_checkbox', name: 'PROJECT_ON_SURFACE', checked: false },
      ],
      previousStatement: STATEMENT_TYPE,
      nextStatement: STATEMENT_TYPE,
      colour: PRIMITIVE_2D_COLOUR,
      tooltip: t('block.trace_photo.tooltip'),
      helpUrl: '',
      inputsInline: true,
      extensions: ['os_trace_photo_defaults', CENTER_SYNC_EXTENSION],
      mutator: STATE_EXTENSION,
    },
  ]
}
