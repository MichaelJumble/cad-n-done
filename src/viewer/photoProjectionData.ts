import type { Block, Workspace } from 'blockly'
import {
  catmullRomControlPoints,
  catmullRomNeighbor,
  type TracePhotoState,
  type TracePoint,
} from '../editor/blocks/tracePhoto'

/** Alles, was PhotoProjectionManager (photoProjection.ts) braucht, um die
 *  nachgezeichnete Kontur eines Fotos als Draufsicht-Textur auf die
 *  tatsaechliche 3D-Geometrie zu projizieren. `pxMinX/pxMinY/pxMaxX/pxMaxY`
 *  ist die Pixel-Bounding-Box der KONTUR SELBST (nicht die volle Fotogroesse!
 *  siehe collectPhotoProjections) - photoProjection.ts nutzt sie, um die
 *  Textur exakt auf diesen Ausschnitt zuzuschneiden, damit sie 1:1 zur
 *  Millimeter-Weltbox (boundsMinX/MinY/MaxX/MaxY) passt. */
export interface PhotoProjection {
  blockId: string
  photoDataUrl: string
  points: TracePoint[]
  closed: boolean
  closingControl?: { x: number; y: number }
  pxMinX: number
  pxMinY: number
  pxMaxX: number
  pxMaxY: number
  boundsMinX: number
  boundsMinY: number
  boundsMaxX: number
  boundsMaxY: number
}

/** Liest einen literalen Zahlenwert von einem Value-Eingang - identisches
 *  Muster wie readLiteralNumber() in editor/customizer.ts (dort nicht
 *  exportiert, daher hier als eigene kleine Kopie). Nicht-literale Ausdruecke
 *  (z.B. eine Variable) liefern null - der Aufrufer ueberspringt den Block
 *  dann einfach, statt zu raten. */
function readLiteralNumber(block: Block, inputName: string): number | null {
  const target = block.getInputTargetBlock(inputName)
  if (!target || target.type !== 'math_number') return null
  const raw = target.getFieldValue('NUM')
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
  return Number.isFinite(value) ? value : null
}

/** Anzahl Abtastpunkte je Kurvensegment fuer pathPixelBounds() - grob genug
 *  fuer eine Bounding-Box-Naeherung, aber fein genug, dass der Fehler
 *  gegenueber der echten Kurve praktisch verschwindet. */
const CURVE_SAMPLES = 24

/** Pixel-Bounding-Box der tatsaechlich gerenderten KONTUR - bewusst NICHT
 *  die volle Foto-Leinwand (state.width/height) UND NICHT einfach die rohen
 *  Anker-/Kontrollpunkte: ein Bezier-Kontrollpunkt liegt selbst NIE auf der
 *  Kurve (er zieht sie nur dorthin) - eine Bounding-Box aus den rohen Punkten
 *  ueberschaetzt daher den Ausschlag einer Kurve, und zwar ungleichmaessig
 *  zwischen den Kanten, was die Zentrierung (center=true) gerade bei einer
 *  gekruemmten Kante sichtbar verschiebt. Stattdessen wird jedes Kurven-
 *  segment mit der exakten Bezier-Formel abgetastet (fuer `smooth`-Punkte:
 *  dieselben automatisch berechneten Catmull-Rom-Kontrollpunkte wie in
 *  tracePathData() - siehe dort) und die Bounding-Box aus den Abtastpunkten
 *  gebildet - das entspricht sehr nah der tatsaechlich von OpenSCADs
 *  SVG-Importer tessellierten Geometrie, an deren Bounding-Box sich
 *  center=true orientiert. Auf Integer gerundet (floor/ceil), damit
 *  photoProjection.ts denselben Bereich 1:1 als Textur-Ausschnitt
 *  zuschneiden kann. */
function pathPixelBounds(
  points: TracePoint[],
  closed: boolean,
  closingControl?: { x: number; y: number },
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (points.length === 0) return null
  const n = points.length
  const neighbor = (index: number) => catmullRomNeighbor(points, index, closed)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const consider = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const sampleQuadratic = (
    p0: { x: number; y: number },
    control: { x: number; y: number },
    p1: { x: number; y: number },
  ): void => {
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES
      const mt = 1 - t
      consider(
        mt * mt * p0.x + 2 * mt * t * control.x + t * t * p1.x,
        mt * mt * p0.y + 2 * mt * t * control.y + t * t * p1.y,
      )
    }
  }
  const sampleCubic = (
    p0: { x: number; y: number },
    c1: { x: number; y: number },
    c2: { x: number; y: number },
    p1: { x: number; y: number },
  ): void => {
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES
      const mt = 1 - t
      consider(
        mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
        mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y,
      )
    }
  }

  consider(points[0].x, points[0].y)
  for (let i = 1; i < n; i++) {
    const prev = points[i - 1]
    const p = points[i]
    if (p.smooth) {
      const { c1, c2 } = catmullRomControlPoints(neighbor(i - 2), prev, p, neighbor(i + 1))
      sampleCubic(prev, c1, c2, p)
    } else if (p.control) {
      sampleQuadratic(prev, p.control, p)
    } else {
      consider(p.x, p.y)
    }
  }
  if (closed) {
    const first = points[0]
    const last = points[n - 1]
    if (first.smooth) {
      const { c1, c2 } = catmullRomControlPoints(neighbor(n - 2), last, first, neighbor(1))
      sampleCubic(last, c1, c2, first)
    } else if (closingControl) {
      sampleQuadratic(last, closingControl, first)
    } else {
      consider(first.x, first.y)
    }
  }

  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    maxX: Math.ceil(maxX),
    maxY: Math.ceil(maxY),
  }
}

/** Sammelt alle os_trace_photo-Bloecke mit aktivierter "auf Objekt
 *  projizieren"-Checkbox ein und rechnet direkt die Millimeter-Bounding-Box
 *  der KONTUR aus - dieselbe Pixel->mm-Formel wie OpenSCADs eigener
 *  SVG-Importer (scale = 25.4/dpi; bei center=true zentriert OpenSCAD anhand
 *  der Bounding-Box der importierten Geometrie selbst, siehe
 *  pathPixelBounds()). */
export function collectPhotoProjections(workspace: Workspace): PhotoProjection[] {
  const projections: PhotoProjection[] = []
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type !== 'os_trace_photo') continue
    // Deaktivierte Bloecke (per Rechtsklick "Block deaktivieren", oder weil
    // ein umschliessender Block deaktiviert ist) tragen laut
    // OpenscadCodeGenerator.blockToCode() (siehe openscadGenerator.ts) NUR
    // noch auskommentierten Code bei - beeinflussen also die tatsaechliche
    // Geometrie nicht mehr. Die Projektion muss dem folgen, sonst wuerde das
    // Foto weiter auf Objekte projiziert, die es laut generiertem Code gar
    // nicht mehr gibt/beeinflusst.
    if (!block.isEnabled() || block.getInheritedDisabled()) continue
    if (block.getFieldValue('PROJECT_ON_SURFACE') !== 'TRUE') continue
    const state = block.saveExtraState?.() as Partial<TracePhotoState> | undefined
    if (!state?.points?.length || !state.closed) continue

    const pxBounds = pathPixelBounds(state.points, state.closed, state.closingControl)
    if (!pxBounds) continue
    const pxWidth = pxBounds.maxX - pxBounds.minX
    const pxHeight = pxBounds.maxY - pxBounds.minY
    if (pxWidth <= 0 || pxHeight <= 0) continue

    const dpi = readLiteralNumber(block, 'DPI')
    if (dpi === null || dpi <= 0) continue
    const centered = block.getFieldValue('CENTER') === 'TRUE'
    const scale = 25.4 / dpi
    const widthMm = pxWidth * scale
    const heightMm = pxHeight * scale

    projections.push({
      blockId: block.id,
      photoDataUrl: state.photoDataUrl ?? '',
      points: state.points,
      closed: state.closed,
      closingControl: state.closingControl,
      pxMinX: pxBounds.minX,
      pxMinY: pxBounds.minY,
      pxMaxX: pxBounds.maxX,
      pxMaxY: pxBounds.maxY,
      boundsMinX: centered ? -widthMm / 2 : pxBounds.minX * scale,
      boundsMaxX: centered ? widthMm / 2 : pxBounds.maxX * scale,
      boundsMinY: centered ? -heightMm / 2 : -pxBounds.maxY * scale,
      boundsMaxY: centered ? heightMm / 2 : -pxBounds.minY * scale,
    })
  }
  return projections
}
