/// <reference lib="webworker" />
import type { RenderRequest, RenderResult, RenderedFragment, RenderProgress } from '../types'
import { FONT_FILENAMES } from './fonts'
import { runOpenscad, type EngineInput } from './manifoldEngine'

declare const self: DedicatedWorkerGlobalScope

// OpenSCAD gibt das hier aus, wenn ein Fragment gueltig ist, aber keinerlei
// Geometrie erzeugt (z.B. "falls"-Block mit einer gerade falschen
// Bedingung) — kein Fehler, sondern ein legitimes leeres Ergebnis.
const EMPTY_OBJECT_MESSAGE = 'Current top level object is empty'

// Kommt z.B. bei einem alleinstehenden SVG-Import ohne "extrudieren"-Wrapper
// (STL kennt nur 3D-Geometrie). Statt der kryptischen, mit Fontconfig-
// Rauschen ueberladenen Rohmeldung eine klare, umsetzbare Fehlermeldung.
const NOT_3D_OBJECT_MESSAGE = 'Current top level object is not a 3D object'
const NOT_3D_OBJECT_HINT =
  'Nur 2D-Geometrie vorhanden — zum Rendern mit dem "extrudieren"-Block (Kategorie Transformationen) zu einem 3D-Körper machen.'

const FONTS_CONF = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/fonts</dir>
  <cachedir>/fonts-cache</cachedir>
</fontconfig>
`

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const { requestId, fragments, svgAssets, stlAssets } = event.data
  const start = performance.now()
  // Stderr des zuletzt bearbeiteten Fragments, fuer eine aussagekraeftige
  // Fehlermeldung falls der Render insgesamt fehlschlaegt (siehe unterer
  // catch-Block) — wird bei jedem Fragment neu belegt.
  let lastFragmentStderr = ''
  // blob:-URLs fuer binaere STL-Asset-Inhalte (das Worker-Protokoll kennt nur
  // Text ueber `content`, Binaerdaten muessen per `url` + fetch() geladen
  // werden) — einmal pro Render erzeugt, fuer alle Fragmente wiederverwendet,
  // am Ende freigegeben.
  const stlBlobUrls: string[] = []

  try {
    const sharedInputs: EngineInput[] = [
      { path: '/etc/fonts/fonts.conf', content: FONTS_CONF },
      ...FONT_FILENAMES.map((filename) => ({
        path: `/fonts/${filename}`,
        url: `${import.meta.env.BASE_URL}fonts/${filename}`,
      })),
      ...svgAssets.map((asset) => ({ path: `/${asset.filename}`, content: asset.svg })),
      ...stlAssets.map((asset) => {
        const url = URL.createObjectURL(new Blob([asset.data.buffer as ArrayBuffer]))
        stlBlobUrls.push(url)
        return { path: `/${asset.filename}`, url }
      }),
    ]

    const rendered: RenderedFragment[] = []
    const transferables: ArrayBuffer[] = []
    for (let i = 0; i < fragments.length; i++) {
      const fragment = fragments[i]
      let fragmentResult = await runOpenscad(
        [{ path: '/input.scad', content: fragment.code }, ...sharedInputs],
        ['/input.scad', '-o', '/output.stl', '--backend=manifold'],
        ['/output.stl'],
      )
      lastFragmentStderr = fragmentResult.mergedStderr
      let stlBytes = fragmentResult.outputs.get('/output.stl')
      // Reine 2D-Flaeche (kein "extrudieren"-Block drum herum): statt hart
      // abzubrechen, denselben Code hauchduenn extrudiert ein zweites Mal
      // versuchen, NUR damit im Viewer ueberhaupt etwas sichtbar ist - analog
      // zu OpenSCAD/BlockSCAD, die 2D-Entwuerfe ebenfalls automatisch mit
      // einer minimalen Hoehe darstellen. fragment.code (und damit der
      // generierte/exportierte Text) bleibt dabei unveraendert 2D.
      if (!stlBytes && fragment.previewCode && lastFragmentStderr.includes(NOT_3D_OBJECT_MESSAGE)) {
        fragmentResult = await runOpenscad(
          [{ path: '/input.scad', content: fragment.previewCode }, ...sharedInputs],
          ['/input.scad', '-o', '/output.stl', '--backend=manifold'],
          ['/output.stl'],
        )
        lastFragmentStderr = fragmentResult.mergedStderr
        stlBytes = fragmentResult.outputs.get('/output.stl')
      }
      if (!stlBytes) {
        // Ein einzelnes Fragment, das (noch) keine Geometrie liefert, darf
        // nicht den gesamten Render abbrechen — sonst wuerde z.B. ein
        // "falls"-Zweig mit aktuell falscher Bedingung faelschlich JEDES
        // andere, tatsaechlich gueltige Fragment mit ausblenden.
        if (fragmentResult.mergedStderr.includes(EMPTY_OBJECT_MESSAGE)) {
          self.postMessage({
            requestId,
            kind: 'progress',
            index: i,
            total: fragments.length,
            color: fragment.color,
          } satisfies RenderProgress)
          continue
        }
        throw new Error(fragmentResult.error ?? 'renderToStl fehlgeschlagen')
      }
      const buffer = stlBytes.buffer.slice(
        stlBytes.byteOffset,
        stlBytes.byteOffset + stlBytes.byteLength,
      ) as ArrayBuffer
      rendered.push({ stl: buffer, color: fragment.color, blockId: fragment.blockId })
      transferables.push(buffer)
      // Zwischenstand fuer die Fortschrittsanzeige im Viewer (siehe
      // ui/viewerPanel.ts) - der Haupt-Thread bekommt sonst erst nach ALLEN
      // Fragmenten ueberhaupt ein Lebenszeichen.
      self.postMessage({
        requestId,
        kind: 'progress',
        index: i,
        total: fragments.length,
        color: fragment.color,
      } satisfies RenderProgress)
    }

    const result: RenderResult = {
      requestId,
      status: 'success',
      fragments: rendered,
      renderTimeMs: performance.now() - start,
    }
    self.postMessage(result, transferables)
  } catch (err) {
    const isNot3d = lastFragmentStderr.includes(NOT_3D_OBJECT_MESSAGE)
    const message = isNot3d ? NOT_3D_OBJECT_HINT : lastFragmentStderr.trim() || String(err)
    const lineMatch = isNot3d ? null : /line (\d+)/i.exec(lastFragmentStderr)

    const result: RenderResult = {
      requestId,
      status: 'error',
      message,
      line: lineMatch ? Number(lineMatch[1]) : undefined,
    }
    self.postMessage(result)
  } finally {
    for (const url of stlBlobUrls) URL.revokeObjectURL(url)
  }
}
